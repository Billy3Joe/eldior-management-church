const mongoose = require("mongoose");

const Member = require("../models/Member");
const Event = require("../models/Event");
const Attendance = require("../models/Attendance");
const PastoralAlert = require("../models/PastoralAlert");
const User = require("../models/User");

const createPersonHistory = require("../utils/createPersonHistory");

const ALERT_TYPE = "Absence prolongée";
const MIN_ABSENCES = 2;
const COMPLETED_STATUSES = ["Terminé", "completed"];
const ALERT_STATUSES = ["Ouverte", "En cours", "Résolue"];
const ALERT_LEVELS = ["Attention", "À suivre", "Critique"];

const validId = (value) =>
  mongoose.isValidObjectId(value);

const errorResponse = (res, status, message) =>
  res.status(status).json({ success: false, message });

const memberName = (member) =>
  `${member?.firstName || ""} ${member?.lastName || ""}`.trim() ||
  "Cette personne";

const getAlertLevel = (count) =>
  count >= 4 ? "Critique" : count >= 3 ? "À suivre" : "Attention";

const daysSince = (date, now = new Date()) => {
  if (!date) return null;
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor((now.getTime() - value) / 86400000));
};

const parsePeriod = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)
  ) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);

  return {
    periodKey: value,
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
};

const {
  assertClosedPeriod,
  getPreviousParisPeriodKey,
} = require("../services/pastoralAlertService");

const safeHistory = async ({
  req = null,
  churchId,
  member,
  alert,
  type,
  title,
  description,
  previousValue = "",
  newValue = "",
  origin = "automatic",
  changes = {},
}) => {
  try {
    await createPersonHistory({
      req,
      churchId,
      memberId: member._id,
      type,
      category: "Suivi pastoral",
      title,
      description,
      occurredAt: new Date(),
      previousValue,
      newValue,
      sourceType: "PastoralAlert",
      sourceId: alert._id,
      metadata: {
        alertId: alert._id,
        alertType: alert.type,
        periodKey: alert.periodKey,
        absenceCount: alert.absenceCount,
        missedServiceIds: alert.missedServiceIds,
        level: alert.level,
        status: alert.status,
        assignedTo: alert.assignedTo,
        contactedAt: alert.contactedAt,
        resolvedAt: alert.resolvedAt,
        ...changes,
      },
      origin,
      visibility: "standard",
    });
  } catch (error) {
    console.error(
      "[PastoralAlert] Historique non bloquant :",
      error.message
    );
  }
};

const populateAlert = async (alert) => {
  if (!alert) return alert;

  await alert.populate([
    {
      path: "member",
      select:
        "firstName lastName phone email status membershipType " +
        "ageGroup gender department family spiritualStage " +
        "followUpStatus membershipDate firstVisitDate " +
        "integratedAt wasVisitor",
      populate: [
        { path: "department", select: "name" },
        { path: "family", select: "name" },
      ],
    },
    {
      path: "assignedTo",
      select: "name email role",
    },
    {
      path: "resolvedBy",
      select: "name email role",
    },
    {
      path: "missedServiceIds",
      select: "title date status attendanceClosed",
    },
  ]);

  return alert;
};

const trackingStart = (member) => {
  const candidates = member.wasVisitor
    ? [
        member.firstVisitDate,
        member.integratedAt,
        member.membershipDate,
        member.createdAt,
      ]
    : [
        member.membershipDate,
        member.firstVisitDate,
        member.createdAt,
      ];

  for (const value of candidates) {
    if (!value) continue;

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
};

const findLastPresence = async (churchId, memberId, now) => {
  const services = await Event.find({
    church: churchId,
    isSundayService: true,
    attendanceClosed: true,
    status: { $in: COMPLETED_STATUSES },
    date: { $lte: now },
  })
    .select("_id date")
    .lean();

  if (!services.length) return null;

  const dateById = new Map(
    services.map((service) => [
      String(service._id),
      service.date,
    ])
  );

  const presences = await Attendance.find({
    church: churchId,
    member: memberId,
    event: { $in: services.map((service) => service._id) },
    status: { $in: ["Présent", "En retard"] },
  })
    .select("event")
    .lean();

  let latest = null;

  for (const attendance of presences) {
    const date = dateById.get(String(attendance.event));

    if (date && (!latest || new Date(date) > latest)) {
      latest = new Date(date);
    }
  }

  return latest;
};

// ======================================================
// VÉRIFICATION D'APPARTENANCE À L'ÉGLISE
// ======================================================

const findEligibleAssignee = async (userId, churchId) => {
  if (!validId(userId) || !validId(churchId)) {
    return null;
  }

  return User.findOne({
    _id: userId,
    isActive: true,
    $or: [
      {
        churchMemberships: {
          $elemMatch: {
            church: churchId,
            isActive: true,
          },
        },
      },
      {
        church: churchId,
        "churchMemberships.0": { $exists: false },
      },
    ],
  })
    .select("_id name email")
    .lean();
};

// ======================================================
// SCAN MENSUEL DES ABSENCES
// ======================================================

const scanMonthlyAbsences = async ({
  churchId,
  periodKey,
  req = null,
  signal = null,
  assertLockOwnership = null,
}) => {
  const checkScan = async () => {
    if (signal?.aborted) {
      const error = new Error(
        "Analyse pastorale interrompue : verrou perdu."
      );
      error.status = 503;
      throw error;
    }

    if (typeof assertLockOwnership === "function") {
      await assertLockOwnership();
    }
  };

  const period = parsePeriod(periodKey);

  if (!period) {
    const error = new Error(
      "Période invalide. Format attendu : AAAA-MM."
    );
    error.status = 400;
    throw error;
  }

  if (!validId(churchId)) {
    const error = new Error("Église invalide.");
    error.status = 400;
    throw error;
  }

  // Protection également dans la fonction métier.
  assertClosedPeriod(periodKey);

  const now = new Date();

  await checkScan();

  const services = await Event.find({
    church: churchId,
    isSundayService: true,
    attendanceClosed: true,
    status: { $in: COMPLETED_STATUSES },
    date: {
      $gte: period.start,
      $lt: period.end,
    },
  })
    .select("_id title date attendanceRevision")
    .sort({ date: 1 })
    .lean();

  const result = {
    periodKey,
    scannedServices: services.length,
    scannedMembers: 0,
    detectedMembers: 0,
    activeAlerts: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    automaticallyResolved: 0,
    ignoredNotEnoughHistory: 0,
  };

  const countActiveAlerts = () =>
    PastoralAlert.countDocuments({
      church: churchId,
      type: ALERT_TYPE,
      periodKey,
      status: { $ne: "Résolue" },
    });

  if (!services.length) {
    result.activeAlerts = await countActiveAlerts();
    return result;
  }

  const members = await Member.find({
    church: churchId,
    status: "Actif",
    membershipType: "Membre",
  })
    .select(
      "_id firstName lastName membershipDate " +
      "firstVisitDate integratedAt wasVisitor createdAt"
    )
    .lean();

  result.scannedMembers = members.length;

  if (!members.length) {
    result.activeAlerts = await countActiveAlerts();
    return result;
  }

  const serviceIds = services.map((service) => service._id);
  const memberIds = members.map((member) => member._id);

  // Seul le statut explicitement "Absent" compte.
  const absences = await Attendance.find({
    church: churchId,
    event: { $in: serviceIds },
    member: { $in: memberIds },
    status: "Absent",
  })
    .select("member event")
    .lean();

  const absencesByMember = new Map();

  for (const attendance of absences) {
    const memberId = String(attendance.member);

    if (!absencesByMember.has(memberId)) {
      absencesByMember.set(memberId, new Set());
    }

    absencesByMember
      .get(memberId)
      .add(String(attendance.event));
  }

  for (const member of members) {
    await checkScan();

    const start = trackingStart(member);

    const eligibleServices = services.filter(
      (service) => !start || new Date(service.date) >= start
    );

    if (eligibleServices.length < MIN_ABSENCES) {
      result.ignoredNotEnoughHistory += 1;
      continue;
    }

    const absentIds =
      absencesByMember.get(String(member._id)) || new Set();

    const missedServices = eligibleServices.filter(
      (service) => absentIds.has(String(service._id))
    );

    const absenceCount = missedServices.length;

    let consecutiveMissedServices = 0;

    for (let i = eligibleServices.length - 1; i >= 0; i--) {
      const serviceId = String(eligibleServices[i]._id);

      if (!absentIds.has(serviceId)) {
        break;
      }

      consecutiveMissedServices++;
    }

    if (absenceCount < MIN_ABSENCES) {
      continue;
    }

    result.detectedMembers += 1;

    const level = getAlertLevel(absenceCount);

    const lastPresenceDate = await findLastPresence(
      churchId,
      member._id,
      now
    );

    const latestService =
      eligibleServices[eligibleServices.length - 1];

    const revision = eligibleServices.reduce(
      (total, service) =>
        total + (service.attendanceRevision || 0),
      0
    );

    const filter = {
      church: churchId,
      member: member._id,
      type: ALERT_TYPE,
      periodKey,
    };

    const existing = await PastoralAlert.findOne(filter);

    await checkScan();

    if (!existing) {
      let alert;
      let created = false;

      try {
        await checkScan();

        const operation = await PastoralAlert.findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...filter,
              level,
              absenceCount,
              missedServiceIds: missedServices.map(
                (service) => service._id
              ),
              detectionRevision: revision,
              consecutiveMissedServices,
              lastPresenceDate,
              daysSinceLastPresence: daysSince(
                lastPresenceDate,
                now
              ),
              lastCheckedServiceDate: latestService.date,
              status: "Ouverte",
              detectedAt: now,
              lastDetectedAt: now,
            },
          },
          {
            upsert: true,
            returnDocument: "after",
            runValidators: true,
            includeResultMetadata: true,
          }
        );

        alert = operation.value;

        created = Boolean(
          operation.lastErrorObject?.upserted
        );
      } catch (error) {
        if (error.code !== 11000) {
          throw error;
        }

        alert = await PastoralAlert.findOne(filter);
      }

      if (created) {
        result.created += 1;

        await checkScan();

        await safeHistory({
          req,
          churchId,
          member,
          alert,
          type: "PASTORAL_ALERT_CREATED",
          title: "Alerte pastorale détectée",
          description:
            `${memberName(member)} totalise ` +
            `${absenceCount} absences explicites ` +
            `sur les cultes dominicaux de ${periodKey}.`,
          newValue: level,
        });

        continue;
      }
    }

    const alert =
      existing || (await PastoralAlert.findOne(filter));

    if (!alert) continue;

    const previousLevel = alert.level;
    const previousCount = alert.absenceCount;

    const previousIds = (alert.missedServiceIds || [])
      .map(String)
      .sort();

    const nextIds = missedServices
      .map((service) => String(service._id))
      .sort();

    const changed =
      previousLevel !== level ||
      previousCount !== absenceCount ||
      alert.consecutiveMissedServices !== consecutiveMissedServices ||
      JSON.stringify(previousIds) !== JSON.stringify(nextIds);

    if (!changed) {
      result.unchanged += 1;
      continue;
    }

    alert.level = level;
    alert.absenceCount = absenceCount;
    alert.consecutiveMissedServices = consecutiveMissedServices;
    alert.missedServiceIds = missedServices.map(
      (service) => service._id
    );
    alert.detectionRevision = revision;
    alert.lastPresenceDate = lastPresenceDate;
    alert.daysSinceLastPresence = daysSince(
      lastPresenceDate,
      now
    );
    alert.lastCheckedServiceDate = latestService.date;
    alert.lastDetectedAt = now;

    // Ne jamais modifier automatiquement :
    // status, assignedTo, note, contactedAt,
    // resolvedAt ou resolvedBy.

    await checkScan();
    await alert.save();

    result.updated += 1;

    await checkScan();

    await safeHistory({
      req,
      churchId,
      member,
      alert,
      type: "PASTORAL_ALERT_UPDATED",
      title: "Alerte pastorale actualisée",
      description:
        `Le nombre d'absences de ${memberName(member)} ` +
        `pour ${periodKey} est passé de ` +
        `${previousCount} à ${absenceCount}.`,
      previousValue: String(previousCount),
      newValue: String(absenceCount),
      changes: {
        previousLevel,
        newLevel: level,
      },
    });
  }

  await checkScan();

  result.activeAlerts = await countActiveAlerts();

  return result;
};

// ======================================================
// POST /api/pastoral-alerts/scan
// ======================================================

exports.scanProlongedAbsences = async (req, res, next) => {
  try {
    const periodKey =
      req.body?.periodKey ??
      req.query?.periodKey ??
      getPreviousParisPeriodKey();

    const { executePastoralScan } = require(
      "../services/pastoralAlertService"
    );

    const result = await executePastoralScan({
      churchId: req.churchId,
      periodKey,
      req,
    });

    if (result.skipped) {
      return res.status(409).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};// ======================================================
// GET /api/pastoral-alerts
// ======================================================

exports.getPastoralAlerts = async (req, res, next) => {
  try {
    const {
      status,
      level,
      assignedTo,
      search,
      periodKey,
    } = req.query;

    const query = {
      church: req.churchId,
    };

    if (status) {
      if (!ALERT_STATUSES.includes(status)) {
        return errorResponse(res, 400, "Statut invalide.");
      }

      query.status = status;
    }

    if (level) {
      if (!ALERT_LEVELS.includes(level)) {
        return errorResponse(res, 400, "Niveau invalide.");
      }

      query.level = level;
    }

    if (periodKey) {
      if (!parsePeriod(periodKey)) {
        return errorResponse(res, 400, "Période invalide.");
      }

      query.periodKey = periodKey;
    }

    if (assignedTo) {
      if (!validId(assignedTo)) {
        return errorResponse(
          res,
          400,
          "Identifiant du responsable invalide."
        );
      }

      query.assignedTo = assignedTo;
    }

    if (typeof search === "string" && search.trim()) {
      const escaped = search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const regex = new RegExp(escaped, "i");

      const members = await Member.find({
        church: req.churchId,
        $or: [
          { firstName: regex },
          { lastName: regex },
          { phone: regex },
          { email: regex },
        ],
      })
        .select("_id")
        .lean();

      query.member = {
        $in: members.map((member) => member._id),
      };
    }

    const alerts = await PastoralAlert.find(query)
      .populate({
        path: "member",
        select:
          "firstName lastName phone email status membershipType " +
          "ageGroup gender spiritualStage followUpStatus " +
          "membershipDate firstVisitDate integratedAt wasVisitor",
      })
      .populate("assignedTo", "name email role")
      .populate("resolvedBy", "name email role")
      .sort({
        periodKey: -1,
        detectedAt: -1,
      });

    return res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET /api/pastoral-alerts/stats
// ======================================================

exports.getPastoralAlertStats = async (req, res, next) => {
  try {
    const base = {
      church: req.churchId,
    };

    if (req.query.periodKey) {
      if (!parsePeriod(req.query.periodKey)) {
        return errorResponse(
          res,
          400,
          "Période invalide."
        );
      }

      base.periodKey = req.query.periodKey;
    }

    const active = {
      ...base,
      status: { $ne: "Résolue" },
    };

    const [
      totalOpen,
      attention,
      followUp,
      critical,
      inProgress,
      resolved,
      unassigned,
    ] = await Promise.all([
      PastoralAlert.countDocuments(active),

      PastoralAlert.countDocuments({
        ...active,
        level: "Attention",
      }),

      PastoralAlert.countDocuments({
        ...active,
        level: "À suivre",
      }),

      PastoralAlert.countDocuments({
        ...active,
        level: "Critique",
      }),

      PastoralAlert.countDocuments({
        ...base,
        status: "En cours",
      }),

      PastoralAlert.countDocuments({
        ...base,
        status: "Résolue",
      }),

      PastoralAlert.countDocuments({
        ...active,
        assignedTo: null,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalOpen,
        byLevel: {
          attention,
          followUp,
          critical,
        },
        inProgress,
        resolved,
        unassigned,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET /api/pastoral-alerts/member/:memberId
// ======================================================

exports.getMemberPastoralAlerts = async (
  req,
  res,
  next
) => {
  try {
    const { memberId } = req.params;

    if (!validId(memberId)) {
      return errorResponse(
        res,
        400,
        "Identifiant de personne invalide."
      );
    }

    const member = await Member.findOne({
      _id: memberId,
      church: req.churchId,
    })
      .select("_id firstName lastName")
      .lean();

    if (!member) {
      return errorResponse(
        res,
        404,
        "Personne introuvable."
      );
    }

    const alerts = await PastoralAlert.find({
      church: req.churchId,
      member: memberId,
    })
      .populate("assignedTo", "name email role")
      .populate("resolvedBy", "name email role")
      .sort({
        periodKey: -1,
        detectedAt: -1,
      });

    return res.status(200).json({
      success: true,
      data: {
        member,
        alerts,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET /api/pastoral-alerts/:id
// ======================================================

exports.getPastoralAlertById = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return errorResponse(
        res,
        400,
        "Identifiant d'alerte invalide."
      );
    }

    const alert = await PastoralAlert.findOne({
      _id: id,
      church: req.churchId,
    });

    if (!alert) {
      return errorResponse(
        res,
        404,
        "Alerte pastorale introuvable."
      );
    }

    await populateAlert(alert);

    return res.status(200).json({
      success: true,
      data: alert,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// PUT /api/pastoral-alerts/:id
// ======================================================

exports.updatePastoralAlert = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return errorResponse(
        res,
        400,
        "Identifiant d'alerte invalide."
      );
    }

    const alert = await PastoralAlert.findOne({
      _id: id,
      church: req.churchId,
    });

    if (!alert) {
      return errorResponse(
        res,
        404,
        "Alerte pastorale introuvable."
      );
    }

    const {
      status,
      assignedTo,
      note,
      contacted,
    } = req.body || {};

    // ==================================================
    // ÉTAT AVANT MODIFICATION
    // ==================================================

    const previous = {
      status: alert.status,
      assignedTo: alert.assignedTo
        ? String(alert.assignedTo)
        : null,
      note: alert.note || "",
      contactedAt: alert.contactedAt,
    };

    // ==================================================
    // VALIDATION DU STATUT
    // ==================================================

    if (
      status !== undefined &&
      !ALERT_STATUSES.includes(status)
    ) {
      return errorResponse(
        res,
        400,
        "Statut invalide."
      );
    }

    // ==================================================
    // VALIDATION DE LA NOTE
    // ==================================================

    if (
      note !== undefined &&
      typeof note !== "string"
    ) {
      return errorResponse(
        res,
        400,
        "La note doit être une chaîne de caractères."
      );
    }

    // ==================================================
    // VALIDATION DU CONTACT
    // ==================================================

    if (
      contacted !== undefined &&
      typeof contacted !== "boolean"
    ) {
      return errorResponse(
        res,
        400,
        "Le champ contacted doit être un booléen."
      );
    }

    // ==================================================
    // VALIDATION DU RESPONSABLE PASTORAL
    // ==================================================

    if (assignedTo !== undefined) {
      if (
        assignedTo !== null &&
        assignedTo !== "" &&
        !validId(assignedTo)
      ) {
        return errorResponse(
          res,
          400,
          "Identifiant du responsable invalide."
        );
      }

      if (assignedTo !== null && assignedTo !== "") {
        const eligibleUser = await findEligibleAssignee(
          assignedTo,
          req.churchId
        );

        if (!eligibleUser) {
          return errorResponse(
            res,
            403,
            "Ce responsable ne possède pas " +
            "de compte actif dans cette église."
          );
        }
      }
    }

    // ==================================================
    // MODIFICATION DU STATUT
    // ==================================================

    if (status !== undefined) {
      alert.status = status;

      if (status === "Résolue") {
        if (previous.status !== "Résolue") {
          alert.resolvedAt = new Date();
          alert.resolvedBy = req.user?._id || null;
        }
      } else {
        alert.resolvedAt = null;
        alert.resolvedBy = null;
      }
    }

    // ==================================================
    // ATTRIBUTION DU RESPONSABLE
    // ==================================================

    if (assignedTo !== undefined) {
      alert.assignedTo =
        assignedTo === "" || assignedTo === null
          ? null
          : assignedTo;
    }

    // ==================================================
    // MISE À JOUR DE LA NOTE
    // ==================================================

    if (note !== undefined) {
      alert.note = note.trim();
    }

    // ==================================================
    // CONTACT PASTORAL
    // ==================================================

    if (contacted === true) {
      alert.contactedAt = new Date();

      if (alert.status === "Ouverte") {
        alert.status = "En cours";
      }
    }

    // ==================================================
    // DÉTECTION DES CHANGEMENTS
    // ==================================================

    const currentAssignedTo = alert.assignedTo
      ? String(alert.assignedTo)
      : null;

    const statusChanged =
      previous.status !== alert.status;

    const assignedChanged =
      previous.assignedTo !== currentAssignedTo;

    const noteChanged =
      previous.note !== (alert.note || "");

    const contactedChanged =
      contacted === true;

    const justResolved =
      previous.status !== "Résolue" &&
      alert.status === "Résolue";

    const anyChange =
      statusChanged ||
      assignedChanged ||
      noteChanged ||
      contactedChanged;

    // ==================================================
    // ENREGISTREMENT
    // ==================================================

    if (anyChange) {
      await alert.save();
    }

    // ==================================================
    // HISTORIQUE DU SUIVI PASTORAL
    // ==================================================

    if (anyChange) {
      const member = await Member.findOne({
        _id: alert.member,
        church: req.churchId,
      })
        .select("_id firstName lastName")
        .lean();

      if (member) {
        const changes = {
          previousStatus: previous.status,
          newStatus: alert.status,
          previousAssignedTo: previous.assignedTo,
          newAssignedTo: currentAssignedTo,
          noteChanged,
          contacted: contactedChanged,
          previousContactedAt: previous.contactedAt,
          contactedAt: alert.contactedAt,
        };

        // Ne pas recopier le contenu des notes
        // dans les métadonnées d'historique.

        if (justResolved) {
          await safeHistory({
            req,
            churchId: req.churchId,
            member,
            alert,
            type: "PASTORAL_ALERT_RESOLVED",
            title: "Alerte pastorale résolue",
            description:
              `L'alerte pastorale de ${memberName(member)} ` +
              `pour ${alert.periodKey} a été résolue.`,
            previousValue: previous.status,
            newValue: "Résolue",
            origin: "manual",
            changes,
          });
        } else {
          await safeHistory({
            req,
            churchId: req.churchId,
            member,
            alert,
            type: "PASTORAL_ALERT_UPDATED",
            title: "Suivi pastoral mis à jour",
            description:
              `Le suivi pastoral de ${memberName(member)} ` +
              `pour ${alert.periodKey} a été mis à jour.`,
            previousValue: previous.status,
            newValue: alert.status,
            origin: "manual",
            changes,
          });
        }
      }
    }

    await populateAlert(alert);

    return res.status(200).json({
      success: true,
      message: anyChange
        ? "Alerte pastorale mise à jour."
        : "Aucune modification détectée.",
      data: alert,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// EXPORT INTERNE POUR LE SERVICE CENTRALISÉ
// ======================================================

exports.scanMonthlyAbsences = scanMonthlyAbsences;