
"use strict";

const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const Member = require("../models/Member");
const Event = require("../models/Event");
const PersonHistory = require("../models/PersonHistory");
const createActivityLog = require("../utils/createActivityLog");
const createPersonHistory = require("../utils/createPersonHistory");

// ======================================================
// CONSTANTES
// ======================================================

const ATTENDANCE_STATUSES = [
  "Présent",
  "Absent",
  "Excusé",
  "En retard",
];

const ATTENDED_STATUSES = ["Présent", "En retard"];

const AGE_GROUPS = [
  "0-3", "4-6", "7-10", "11-14",
  "15-17", "18+", "Non renseigné",
];

const validId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const httpError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendError = (res, error, fallback) => {
  console.error(fallback, error);
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || fallback,
  });
};

const calculateAge = (birthDate, referenceDate) => {
  if (!birthDate || !referenceDate) return null;

  const birth = new Date(birthDate);
  const reference = new Date(referenceDate);

  if (
    Number.isNaN(birth.getTime()) ||
    Number.isNaN(reference.getTime())
  ) return null;

  let age = reference.getFullYear() - birth.getFullYear();

  if (
    reference.getMonth() < birth.getMonth() ||
    (
      reference.getMonth() === birth.getMonth() &&
      reference.getDate() < birth.getDate()
    )
  ) age--;

  return age >= 0 ? age : null;
};

const getAgeGroup = (
  age,
  fallback = "Non renseigné"
) => {
  if (age == null) {
    return AGE_GROUPS.includes(fallback)
      ? fallback
      : "Non renseigné";
  }

  if (age <= 3) return "0-3";
  if (age <= 6) return "4-6";
  if (age <= 10) return "7-10";
  if (age <= 14) return "11-14";
  if (age <= 17) return "15-17";
  return "18+";
};

const buildDemographicSnapshot = (member, event) => {
  const ageAtEvent = calculateAge(
    member.birthDate,
    event.date
  );

  return {
    genderSnapshot: member.gender || "",
    ageAtEvent,
    ageGroupSnapshot: getAgeGroup(
      ageAtEvent,
      member.ageGroup || "Non renseigné"
    ),
    membershipTypeSnapshot:
      member.membershipType || "Membre",
  };
};

const safeCreateActivityLog = async (payload) => {
  try {
    await createActivityLog(payload);
  } catch (error) {
    console.error(
      "ActivityLog non bloquant :",
      error.message
    );
  }
};

// ======================================================
// VÉRIFIER QUE LE REGISTRE EST OUVERT
// ======================================================

const ensureAttendanceWritable = async (
  churchId,
  eventId
) => {
  if (!churchId) {
    throw httpError(
      "Aucune église associée à cet utilisateur",
      403
    );
  }

  if (!validId(eventId)) {
    throw httpError(
      "Identifiant d'événement invalide",
      400
    );
  }

  const event = await Event.findOne({
    _id: eventId,
    church: churchId,
  });

  if (!event) {
    throw httpError(
      "Événement introuvable dans cette église",
      404
    );
  }

  if (event.attendanceClosed === true) {
    throw httpError(
      "Le registre de présence est clôturé. " +
      "Un administrateur doit le rouvrir.",
      409
    );
  }

  return event;
};

// ======================================================
// HISTORIQUE DES VISITES
// ======================================================

const recalculateMemberVisitHistory = async (
  churchId,
  memberId,
  req = null
) => {
  try {
    if (!churchId || !memberId) return;

    const member = await Member.findOne({
      _id: memberId,
      church: churchId,
    }).select(
      "firstName lastName membershipType wasVisitor"
    );

    if (!member) return;

    const attendances = await Attendance.find({
      church: churchId,
      member: memberId,
      status: { $in: ATTENDED_STATUSES },
    })
      .select(
        "_id event status isFirstVisit membershipTypeSnapshot"
      )
      .populate(
        "event",
        "title date location type isSundayService"
      );

    const validAttendances = attendances
      .filter((a) => a.event?.date)
      .sort(
        (a, b) =>
          new Date(a.event.date) -
          new Date(b.event.date)
      );

    await Attendance.updateMany(
      { church: churchId, member: memberId },
      { $set: { isFirstVisit: false } }
    );

    const dedupeKey = `first-visit:${memberId}`;

    if (validAttendances.length === 0) {
      await Member.updateOne(
        { _id: memberId, church: churchId },
        {
          $set: {
            firstVisitDate: null,
            lastVisitDate: null,
            visitCount: 0,
          },
        }
      );

      await PersonHistory.deleteOne({
        church: churchId,
        member: memberId,
        type: "FIRST_VISIT",
        dedupeKey,
      });

      return;
    }

    const first = validAttendances[0];
    const last =
      validAttendances[validAttendances.length - 1];

    const hasVisitorAttendance =
      validAttendances.some(
        (a) =>
          a.membershipTypeSnapshot === "Visiteur"
      );

    const isVisitorJourney =
      member.membershipType === "Visiteur" ||
      member.wasVisitor === true ||
      hasVisitorAttendance;

    if (isVisitorJourney) {
      await Attendance.updateOne(
        { _id: first._id, church: churchId },
        { $set: { isFirstVisit: true } }
      );
    }

    await Member.updateOne(
      { _id: memberId, church: churchId },
      {
        $set: {
          firstVisitDate: isVisitorJourney
            ? first.event.date
            : null,
          lastVisitDate: last.event.date,
          visitCount: validAttendances.length,
        },
      }
    );

    if (!isVisitorJourney) {
      await PersonHistory.deleteOne({
        church: churchId,
        member: memberId,
        type: "FIRST_VISIT",
        dedupeKey,
      });
      return;
    }

    const event = first.event;
    const fullName =
      `${member.firstName || ""} ${member.lastName || ""}`
        .trim() || "Cette personne";

    const payload = {
      category: "Visiteur",
      title: "Première visite",
      description:
        `${fullName} a effectué sa première visite ` +
        `lors de « ${event.title || "Événement"} ».`,
      occurredAt: event.date,
      previousValue: "",
      newValue: "Première visite",
      sourceType: "Attendance",
      sourceId: first._id,
      metadata: {
        attendanceId: first._id,
        eventId: event._id,
        eventTitle: event.title || "",
        eventDate: event.date,
        eventLocation: event.location || "",
        eventType: event.type || "",
        isSundayService:
          event.isSundayService === true,
        attendanceStatus: first.status,
        membershipTypeSnapshot:
          first.membershipTypeSnapshot || "",
      },
      visibility: "standard",
    };

    const existing = await PersonHistory.findOne({
      church: churchId,
      member: memberId,
      type: "FIRST_VISIT",
      dedupeKey,
    });

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
    } else {
      await createPersonHistory({
        req,
        churchId,
        memberId,
        type: "FIRST_VISIT",
        ...payload,
        dedupeKey,
        origin: "automatic",
      });
    }
  } catch (error) {
    console.error(
      "Erreur recalcul historique visite :",
      error.message
    );
  }
};

// ======================================================
// SYNCHRONISATION PERSON HISTORY
// ======================================================

const syncAttendancePersonHistory = async ({
  req,
  churchId,
  attendanceId,
  member,
  event,
  status,
}) => {
  try {
    if (
      !churchId ||
      !attendanceId ||
      !member ||
      !event
    ) return;

    const dedupeKey = `attendance:${attendanceId}`;

    if (!ATTENDED_STATUSES.includes(status)) {
      await PersonHistory.deleteOne({
        church: churchId,
        member: member._id,
        type: "ATTENDANCE_RECORDED",
        dedupeKey,
      });
      return;
    }

    const fullName =
      `${member.firstName || ""} ${member.lastName || ""}`
        .trim() || "Cette personne";

    const title =
      status === "En retard"
        ? "Présence enregistrée — En retard"
        : "Présence enregistrée";

    const description =
      `${fullName} était ${status.toLowerCase()} ` +
      `lors de « ${event.title || "Événement"} ».`;

    const metadata = {
      attendanceId,
      eventId: event._id,
      eventTitle: event.title || "",
      eventDate: event.date,
      eventLocation: event.location || "",
      eventType: event.type || "",
      isSundayService:
        event.isSundayService === true,
      status,
    };

    const existing = await PersonHistory.findOne({
      church: churchId,
      member: member._id,
      type: "ATTENDANCE_RECORDED",
      dedupeKey,
    });

    if (existing) {
      Object.assign(existing, {
        title,
        description,
        occurredAt: event.date,
        newValue: status,
        sourceType: "Attendance",
        sourceId: attendanceId,
        metadata,
      });

      await existing.save();
      return;
    }

    await createPersonHistory({
      req,
      churchId,
      memberId: member._id,
      type: "ATTENDANCE_RECORDED",
      category: "Présence",
      title,
      description,
      occurredAt: event.date,
      previousValue: "",
      newValue: status,
      sourceType: "Attendance",
      sourceId: attendanceId,
      dedupeKey,
      metadata,
      origin: "automatic",
      visibility: "standard",
    });
  } catch (error) {
    console.error(
      "Erreur synchronisation PersonHistory :",
      error.message
    );
  }
};

// ======================================================
// POPULATE
// ======================================================

const getPopulatedAttendance = (
  attendanceId,
  churchId
) =>
  Attendance.findOne({
    _id: attendanceId,
    church: churchId,
  })
    .populate(
      "member",
      "firstName lastName email phone gender birthDate " +
      "ageGroup membershipType firstVisitDate " +
      "lastVisitDate visitCount followUpStatus department"
    )
    .populate(
      "event",
      "title date location type status " +
      "isSundayService attendanceClosed"
    )
    .populate("markedBy", "name email role");

// ======================================================
// STATISTIQUES D'UN ÉVÉNEMENT
// ======================================================

const buildEventStatistics = async (
  churchId,
  event
) => {
  const attendances = await Attendance.find({
    church: churchId,
    event: event._id,
  }).populate(
    "member",
    "firstName lastName gender birthDate " +
    "ageGroup membershipType wasVisitor"
  );

  const presentRows = attendances.filter(
    (a) => ATTENDED_STATUSES.includes(a.status)
  );

  const ageGroups = Object.fromEntries(
    AGE_GROUPS.map((group) => [group, 0])
  );

  let men = 0;
  let women = 0;
  let members = 0;
  let visitors = 0;
  let newPeople = 0;
  let newMen = 0;
  let newWomen = 0;

  for (const attendance of presentRows) {
    const member = attendance.member;

    const gender =
      member?.gender ||
      attendance.genderSnapshot ||
      "";

    if (gender === "Homme") men++;
    if (gender === "Femme") women++;

    const age = calculateAge(
      member?.birthDate,
      event.date
    );

    const ageGroup = getAgeGroup(
      age,
      member?.ageGroup ||
        attendance.ageGroupSnapshot ||
        "Non renseigné"
    );

    ageGroups[ageGroup]++;

    const membershipType =
      attendance.membershipTypeSnapshot ||
      member?.membershipType ||
      "Membre";

    if (membershipType === "Visiteur") {
      visitors++;
    } else {
      members++;
    }

    const isRealNewPerson =
      attendance.isFirstVisit === true &&
      (
        attendance.membershipTypeSnapshot ===
          "Visiteur" ||
        member?.wasVisitor === true
      );

    if (isRealNewPerson) {
      newPeople++;
      if (gender === "Homme") newMen++;
      if (gender === "Femme") newWomen++;
    }
  }

  const count = (status) =>
    attendances.filter(
      (attendance) => attendance.status === status
    ).length;

  const present = count("Présent");
  const late = count("En retard");
  const absent = count("Absent");
  const excused = count("Excusé");

  const totalMarked = attendances.length;
  const totalAttendance = present + late;

  const attendanceRate =
    totalMarked > 0
      ? Number(
          (
            (totalAttendance / totalMarked) * 100
          ).toFixed(2)
        )
      : 0;

  return {
    event: {
      _id: event._id,
      title: event.title,
      date: event.date,
      type: event.type,
      location: event.location,
      status: event.status,
      isSundayService:
        event.isSundayService === true,
      attendanceClosed:
        event.attendanceClosed === true,
      attendanceClosedAt:
        event.attendanceClosedAt || null,
      attendanceRevision:
        event.attendanceRevision || 0,
    },
    totalMarked,
    totalAttendance,
    present,
    late,
    absent,
    excused,
    attendanceRate,
    demographics: {
      men,
      women,
      adults: ageGroups["18+"],
      children:
        ageGroups["0-3"] +
        ageGroups["4-6"] +
        ageGroups["7-10"] +
        ageGroups["11-14"],
      teenagers: ageGroups["15-17"],
      ageGroups,
    },
    people: {
      members,
      visitors,
      newPeople,
      newMen,
      newWomen,
    },
  };
};

// ======================================================
// ENREGISTRER / METTRE À JOUR UNE PRÉSENCE
// ======================================================

const markAttendance = async (req, res) => {
  try {
    const {
      member,
      event,
      status = "Présent",
      note = "",
    } = req.body || {};

    if (!req.churchId) {
      throw httpError(
        "Aucune église associée à cet utilisateur",
        403
      );
    }

    if (!member || !event) {
      throw httpError(
        "Le membre et l'événement sont obligatoires",
        400
      );
    }

    if (!validId(member) || !validId(event)) {
      throw httpError(
        "ID membre ou événement invalide",
        400
      );
    }

    if (!ATTENDANCE_STATUSES.includes(status)) {
      throw httpError(
        "Statut de présence invalide",
        400
      );
    }

    const [memberExists, eventExists] =
      await Promise.all([
        Member.findOne({
          _id: member,
          church: req.churchId,
        }),
        ensureAttendanceWritable(
          req.churchId,
          event
        ),
      ]);

    if (!memberExists) {
      throw httpError(
        "Membre introuvable dans cette église",
        404
      );
    }

    const snapshot = buildDemographicSnapshot(
      memberExists,
      eventExists
    );

    const attendance =
      await Attendance.findOneAndUpdate(
        {
          church: req.churchId,
          member,
          event,
        },
        {
          $set: {
            status,
            note:
              typeof note === "string"
                ? note.trim()
                : "",
            ...snapshot,
            markedBy: req.user?._id || null,
            markedAt: new Date(),
          },
          $setOnInsert: {
            church: req.churchId,
            member,
            event,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

    await recalculateMemberVisitHistory(
      req.churchId,
      member,
      req
    );

    await syncAttendancePersonHistory({
      req,
      churchId: req.churchId,
      attendanceId: attendance._id,
      member: memberExists,
      event: eventExists,
      status: attendance.status,
    });

    const populated = await getPopulatedAttendance(
      attendance._id,
      req.churchId
    );

    await safeCreateActivityLog({
      req,
      action: "CREATE",
      entity: "Attendance",
      entityId: attendance._id,
      description:
        `Présence enregistrée pour ` +
        `${memberExists.firstName} ` +
        `${memberExists.lastName} - ` +
        `${eventExists.title} - ${status}`,
    });

    return res.status(200).json({
      success: true,
      message: "Présence enregistrée avec succès",
      data: populated,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur lors de l'enregistrement de la présence"
    );
  }
};

// ======================================================
// TOUTES LES PRÉSENCES
// ======================================================

const getAttendances = async (req, res) => {
  try {
    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        parseInt(req.query.limit, 10) || 10,
        1
      ),
      1000
    );

    const filter = { church: req.churchId };

    if (req.query.member) {
      if (!validId(req.query.member)) {
        throw httpError("ID membre invalide", 400);
      }
      filter.member = req.query.member;
    }

    if (req.query.event) {
      if (!validId(req.query.event)) {
        throw httpError("ID événement invalide", 400);
      }
      filter.event = req.query.event;
    }

    if (req.query.status) {
      if (
        !ATTENDANCE_STATUSES.includes(
          req.query.status
        )
      ) {
        throw httpError("Statut invalide", 400);
      }
      filter.status = req.query.status;
    }

    const [total, attendances] =
      await Promise.all([
        Attendance.countDocuments(filter),
        Attendance.find(filter)
          .populate(
            "member",
            "firstName lastName email phone gender " +
            "birthDate ageGroup membershipType " +
            "firstVisitDate lastVisitDate visitCount " +
            "followUpStatus"
          )
          .populate(
            "event",
            "title date location type status " +
            "isSundayService attendanceClosed"
          )
          .populate(
            "markedBy",
            "name email role"
          )
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
      ]);

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: attendances.length,
      data: attendances,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur getAttendances"
    );
  }
};

// ======================================================
// PRÉSENCES PAR ÉVÉNEMENT
// ======================================================

const getAttendancesByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      throw httpError(
        "ID événement invalide",
        400
      );
    }

    const event = await Event.findOne({
      _id: eventId,
      church: req.churchId,
    });

    if (!event) {
      throw httpError(
        "Événement introuvable",
        404
      );
    }

    const attendances = await Attendance.find({
      church: req.churchId,
      event: eventId,
    })
      .populate(
        "member",
        "firstName lastName email phone gender " +
        "birthDate ageGroup department membershipType " +
        "firstVisitDate lastVisitDate visitCount " +
        "followUpStatus"
      )
      .populate("markedBy", "name email role")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: attendances.length,
      data: attendances,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur getAttendancesByEvent"
    );
  }
};

// ======================================================
// UNE PRÉSENCE
// ======================================================

const getAttendanceById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      throw httpError(
        "ID présence invalide",
        400
      );
    }

    const attendance =
      await getPopulatedAttendance(
        id,
        req.churchId
      );

    if (!attendance) {
      throw httpError(
        "Présence introuvable",
        404
      );
    }

    return res.json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur getAttendanceById"
    );
  }
};

// ======================================================
// MODIFIER UNE PRÉSENCE
// ======================================================

const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      throw httpError(
        "ID présence invalide",
        400
      );
    }

    const attendance = await Attendance.findOne({
      _id: id,
      church: req.churchId,
    });

    if (!attendance) {
      throw httpError(
        "Présence introuvable",
        404
      );
    }

    // Bloquer toute modification après clôture
    const event = await ensureAttendanceWritable(
      req.churchId,
      attendance.event
    );

    const { status, note } = req.body || {};

    if (
      status !== undefined &&
      !ATTENDANCE_STATUSES.includes(status)
    ) {
      throw httpError(
        "Statut invalide",
        400
      );
    }

    if (status !== undefined) {
      attendance.status = status;
    }

    if (note !== undefined) {
      attendance.note =
        typeof note === "string"
          ? note.trim()
          : "";
    }

    attendance.markedBy =
      req.user?._id || attendance.markedBy;

    attendance.markedAt = new Date();

    await attendance.save();

    await recalculateMemberVisitHistory(
      req.churchId,
      attendance.member,
      req
    );

    const member = await Member.findOne({
      _id: attendance.member,
      church: req.churchId,
    });

    if (member) {
      await syncAttendancePersonHistory({
        req,
        churchId: req.churchId,
        attendanceId: attendance._id,
        member,
        event,
        status: attendance.status,
      });
    }

    const updated =
      await getPopulatedAttendance(
        attendance._id,
        req.churchId
      );

    await safeCreateActivityLog({
      req,
      action: "UPDATE",
      entity: "Attendance",
      entityId: attendance._id,
      description:
        `Modification présence : ${attendance.status}`,
    });

    return res.json({
      success: true,
      message:
        "Présence mise à jour avec succès",
      data: updated,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur updateAttendance"
    );
  }
};

// ======================================================
// SUPPRIMER UNE PRÉSENCE
// ======================================================

const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      throw httpError(
        "ID présence invalide",
        400
      );
    }

    const attendance = await Attendance.findOne({
      _id: id,
      church: req.churchId,
    });

    if (!attendance) {
      throw httpError(
        "Présence introuvable",
        404
      );
    }

    // Bloquer la suppression après clôture
    await ensureAttendanceWritable(
      req.churchId,
      attendance.event
    );

    const memberId = attendance.member;

    await PersonHistory.deleteOne({
      church: req.churchId,
      member: memberId,
      type: "ATTENDANCE_RECORDED",
      dedupeKey:
        `attendance:${attendance._id}`,
    });

    await attendance.deleteOne();

    await recalculateMemberVisitHistory(
      req.churchId,
      memberId,
      req
    );

    await safeCreateActivityLog({
      req,
      action: "DELETE",
      entity: "Attendance",
      entityId: id,
      description:
        "Suppression d'une présence",
    });

    return res.json({
      success: true,
      message:
        "Présence supprimée avec succès",
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur deleteAttendance"
    );
  }
};

// ======================================================
// RÉSUMÉ DES PRÉSENCES
// ======================================================

const getAttendanceSummary = async (req, res) => {
  try {
    const filter = {
      church: req.churchId,
    };

    if (req.query.event) {
      if (!validId(req.query.event)) {
        throw httpError(
          "ID événement invalide",
          400
        );
      }

      const event = await Event.exists({
        _id: req.query.event,
        church: req.churchId,
      });

      if (!event) {
        throw httpError(
          "Événement introuvable",
          404
        );
      }

      filter.event = req.query.event;
    }

    const [
      total,
      present,
      absent,
      excused,
      late,
    ] = await Promise.all([
      Attendance.countDocuments(filter),
      Attendance.countDocuments({
        ...filter,
        status: "Présent",
      }),
      Attendance.countDocuments({
        ...filter,
        status: "Absent",
      }),
      Attendance.countDocuments({
        ...filter,
        status: "Excusé",
      }),
      Attendance.countDocuments({
        ...filter,
        status: "En retard",
      }),
    ]);

    const attended = present + late;

    const attendanceRate =
      total > 0
        ? Number(
            ((attended / total) * 100).toFixed(2)
          )
        : 0;

    return res.json({
      success: true,
      data: {
        total,
        present,
        absent,
        excused,
        late,
        attended,
        attendanceRate,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur getAttendanceSummary"
    );
  }
};

// ======================================================
// STATISTIQUES D'UN ÉVÉNEMENT
// ======================================================

const getEventAttendanceAnalytics = async (
  req,
  res
) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      throw httpError(
        "ID événement invalide",
        400
      );
    }

    const event = await Event.findOne({
      _id: eventId,
      church: req.churchId,
    });

    if (!event) {
      throw httpError(
        "Événement introuvable",
        404
      );
    }

    const statistics =
      await buildEventStatistics(
        req.churchId,
        event
      );

    return res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur getEventAttendanceAnalytics"
    );
  }
};

// ======================================================
// STATISTIQUES GLOBALES
// ======================================================

const getGlobalAttendanceAnalytics = async (
  req,
  res
) => {
  try {
    const {
      period = "all",
      startDate,
      endDate,
    } = req.query;

    const allowedPeriods = [
      "all",
      "week",
      "month",
      "year",
      "custom",
    ];

    if (!allowedPeriods.includes(period)) {
      throw httpError(
        "Période invalide",
        400
      );
    }

    const eventFilter = {
      church: req.churchId,
      status: {
        $nin: ["Annulé", "cancelled"],
      },
    };

    const now = new Date();
    let from = null;
    let to = null;

    if (period === "week") {
      from = new Date(now);
      from.setDate(now.getDate() - 7);
    }

    if (period === "month") {
      from = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );
    }

    if (period === "year") {
      from = new Date(
        now.getFullYear(),
        0,
        1
      );
    }

    if (period === "custom") {
      if (startDate) {
        from = new Date(startDate);
      }

      if (endDate) {
        to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
      }
    }

    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime()))
    ) {
      throw httpError(
        "Date invalide",
        400
      );
    }

    if (from && to && from > to) {
      throw httpError(
        "La date de début doit précéder la date de fin",
        400
      );
    }

    if (from || to) {
      eventFilter.date = {};

      if (from) {
        eventFilter.date.$gte = from;
      }

      if (to) {
        eventFilter.date.$lte = to;
      }
    }

    const events = await Event.find(
      eventFilter
    ).sort({ date: 1 });

    const eventIds = events.map(
      (event) => event._id
    );

    const totalMembers =
      await Member.countDocuments({
        church: req.churchId,
      });

    // Toujours filtrer les présences
    // par les événements sélectionnés.
    const attendances = await Attendance.find({
      church: req.churchId,
      event: { $in: eventIds },
    }).select("status event");

    const count = (status) =>
      attendances.filter(
        (item) => item.status === status
      ).length;

    const presentCount = count("Présent");
    const lateCount = count("En retard");
    const absentCount = count("Absent");
    const excusedCount = count("Excusé");

    const totalAttendances =
      presentCount + lateCount;

    const eventsAnalytics =
      await Promise.all(
        events.map(async (event) => {
          const stats =
            await buildEventStatistics(
              req.churchId,
              event
            );

          const notMarked = Math.max(
            totalMembers - stats.totalMarked,
            0
          );

          const attended =
            stats.present + stats.late;

          const attendanceRate =
            totalMembers > 0
              ? Number(
                  (
                    (attended / totalMembers) * 100
                  ).toFixed(2)
                )
              : 0;

          return {
            eventId: event._id,
            title: event.title,
            date: event.date,
            type: event.type,
            status: event.status,
            attendanceClosed:
              event.attendanceClosed === true,
            present: stats.present,
            late: stats.late,
            absent: stats.absent,
            excused: stats.excused,
            notMarked,
            attendanceRate,
          };
        })
      );

    const eventsWithAttendance =
      eventsAnalytics.filter(
        (event) =>
          event.present +
          event.late +
          event.absent +
          event.excused > 0
      );

    const bestAttendanceEvent =
      eventsWithAttendance.length > 0
        ? eventsWithAttendance.reduce(
            (best, current) =>
              current.attendanceRate >
              best.attendanceRate
                ? current
                : best
          )
        : null;

    return res.json({
      success: true,
      data: {
        period,
        startDate: from,
        endDate: to,
        overview: {
          totalMembers,
          presentCount,
          lateCount,
          absentCount,
          excusedCount,
          totalAttendances,
        },
        bestAttendanceEvent,
        eventsAnalytics,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur getGlobalAttendanceAnalytics"
    );
  }
};

// ======================================================
// STATISTIQUES DES CULTES DOMINICAUX CLÔTURÉS
// ======================================================

const getSundayAttendanceAnalytics = async (
  req,
  res
) => {
  try {
    const { from, to } = req.query;

    const requestedLimit =
      parseInt(req.query.limit, 10) || 12;

    const limit = Math.min(
      Math.max(requestedLimit, 1),
      100
    );

    const eventFilter = {
      church: req.churchId,
      isSundayService: true,
      attendanceClosed: true,
      status: {
        $in: ["Terminé", "completed"],
      },
      date: {
        $lte: new Date(),
      },
    };

    if (from) {
      const start = new Date(from);

      if (Number.isNaN(start.getTime())) {
        throw httpError(
          "Date de début invalide",
          400
        );
      }

      eventFilter.date.$gte = start;
    }

    if (to) {
      const end = new Date(to);

      if (Number.isNaN(end.getTime())) {
        throw httpError(
          "Date de fin invalide",
          400
        );
      }

      end.setHours(23, 59, 59, 999);
      eventFilter.date.$lte = end;
    }

    if (
      eventFilter.date.$gte &&
      eventFilter.date.$gte >
        eventFilter.date.$lte
    ) {
      throw httpError(
        "La date de début doit précéder la date de fin",
        400
      );
    }

    const events = await Event.find(
      eventFilter
    )
      .sort({ date: -1 })
      .limit(limit);

    const statistics =
      await Promise.all(
        events.map((event) =>
          buildEventStatistics(
            req.churchId,
            event
          )
        )
      );

    // Ordre chronologique pour les graphiques
    statistics.sort(
      (a, b) =>
        new Date(a.event.date) -
        new Date(b.event.date)
    );

    const numberOfSundays =
      statistics.length;

    const totalAttendance =
      statistics.reduce(
        (sum, item) =>
          sum + item.totalAttendance,
        0
      );

    const totalNewPeople =
      statistics.reduce(
        (sum, item) =>
          sum + (item.people?.newPeople || 0),
        0
      );

    const averageAttendance =
      numberOfSundays > 0
        ? Number(
            (
              totalAttendance / numberOfSundays
            ).toFixed(2)
          )
        : 0;

    const averageNewPeople =
      numberOfSundays > 0
        ? Number(
            (
              totalNewPeople / numberOfSundays
            ).toFixed(2)
          )
        : 0;

    const highestAttendance =
      statistics.length > 0
        ? statistics.reduce(
            (best, current) =>
              !best ||
              current.totalAttendance >
                best.totalAttendance
                ? {
                    event: current.event,
                    totalAttendance:
                      current.totalAttendance,
                  }
                : best,
            null
          )
        : null;

    let growthRate = 0;

    if (statistics.length >= 2) {
      const previous =
        statistics[
          statistics.length - 2
        ].totalAttendance;

      const latest =
        statistics[
          statistics.length - 1
        ].totalAttendance;

      if (previous > 0) {
        growthRate = Number(
          (
            ((latest - previous) / previous) *
            100
          ).toFixed(2)
        );
      }
    }

    return res.json({
      success: true,
      summary: {
        numberOfSundays,
        totalAttendance,
        averageAttendance,
        totalNewPeople,
        averageNewPeople,
        growthRate,
        highestAttendance,
      },
      data: statistics,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Erreur getSundayAttendanceAnalytics"
    );
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  markAttendance,
  getAttendances,
  getAttendancesByEvent,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary,
  getEventAttendanceAnalytics,
  getGlobalAttendanceAnalytics,
  getSundayAttendanceAnalytics,
};
