const mongoose = require("mongoose");

const Member = require("../models/Member");
const Event = require("../models/Event");
const Attendance = require("../models/Attendance");
const PastoralAlert = require("../models/PastoralAlert");

const createPersonHistory = require(
  "../utils/createPersonHistory"
);

// ======================================================
// CONFIGURATION
// ======================================================

const MIN_MISSED_SERVICES = 2;
const MAX_SERVICES_TO_ANALYZE = 12;

const PRESENT_STATUSES = [
  "Présent",
  "En retard",
];

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value);

const isPresentStatus = (status) =>
  PRESENT_STATUSES.includes(status);

// ======================================================
// PERSON HISTORY — HELPER NON BLOQUANT
// ======================================================

const safeCreatePersonHistory = async (
  payload
) => {
  try {
    return await createPersonHistory(
      payload
    );
  } catch (error) {
    console.error(
      "Erreur PersonHistory non bloquante :",
      error.message
    );

    return null;
  }
};

// ======================================================
// NIVEAU D'ALERTE
// ======================================================

const getAlertLevel = (missedCount) => {
  if (missedCount >= 4) {
    return "Critique";
  }

  if (missedCount >= 3) {
    return "À suivre";
  }

  return "Attention";
};

// ======================================================
// NORMALISER UNE DATE
// ======================================================

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

// ======================================================
// CALCULER LE NOMBRE DE JOURS
// ======================================================

const calculateDaysSince = (
  date,
  referenceDate = new Date()
) => {
  const value = normalizeDate(date);
  const reference =
    normalizeDate(referenceDate);

  if (!value || !reference) {
    return null;
  }

  const difference =
    reference.getTime() -
    value.getTime();

  return Math.max(
    0,
    Math.floor(
      difference /
        (1000 * 60 * 60 * 24)
    )
  );
};

// ======================================================
// DATE DE DÉBUT DU SUIVI DES PRÉSENCES
// ======================================================

const getAttendanceTrackingStartDate = (
  member
) => {
  /*
   * Ancien visiteur :
   *
   * On connaît idéalement son parcours depuis
   * sa première visite.
   */

  if (member.wasVisitor === true) {
    return (
      normalizeDate(
        member.firstVisitDate
      ) ||
      normalizeDate(
        member.integratedAt
      ) ||
      normalizeDate(
        member.membershipDate
      ) ||
      normalizeDate(
        member.createdAt
      )
    );
  }

  /*
   * Membre créé directement :
   *
   * membershipDate représente normalement
   * sa véritable entrée comme membre.
   */

  return (
    normalizeDate(
      member.membershipDate
    ) ||
    normalizeDate(
      member.firstVisitDate
    ) ||
    normalizeDate(
      member.createdAt
    )
  );
};

// ======================================================
// NOM COMPLET
// ======================================================

const getMemberFullName = (member) => {
  if (!member) {
    return "Cette personne";
  }

  const fullName =
    `${member.firstName || ""} ${member.lastName || ""}`.trim();

  return fullName || "Cette personne";
};

// ======================================================
// MÉTADONNÉES D'UNE ALERTE
// ======================================================

const buildAlertHistoryMetadata = (
  alert,
  extra = {}
) => {
  return {
    alertId: alert?._id || null,

    alertType:
      alert?.type || "",

    level:
      alert?.level || "",

    status:
      alert?.status || "",

    consecutiveMissedServices:
      alert?.consecutiveMissedServices ||
      0,

    lastPresenceDate:
      alert?.lastPresenceDate ||
      null,

    daysSinceLastPresence:
      alert?.daysSinceLastPresence ??
      null,

    lastCheckedServiceDate:
      alert?.lastCheckedServiceDate ||
      null,

    detectedAt:
      alert?.detectedAt ||
      null,

    lastDetectedAt:
      alert?.lastDetectedAt ||
      null,

    assignedTo:
      alert?.assignedTo?._id ||
      alert?.assignedTo ||
      null,

    contactedAt:
      alert?.contactedAt ||
      null,

    resolvedAt:
      alert?.resolvedAt ||
      null,

    resolvedBy:
      alert?.resolvedBy?._id ||
      alert?.resolvedBy ||
      null,

    ...extra,
  };
};

// ======================================================
// HISTORIQUE — ALERTE CRÉÉE
// ======================================================

const createPastoralAlertCreatedHistory =
  async ({
    req = null,
    churchId,
    member,
    alert,
  }) => {
    const fullName =
      getMemberFullName(member);

    await safeCreatePersonHistory({
      req,

      churchId,

      memberId:
        member._id,

      type:
        "PASTORAL_ALERT_CREATED",

      category:
        "Suivi pastoral",

      title:
        "Alerte pastorale détectée",

      description:
        `${fullName} présente ${alert.consecutiveMissedServices} absences consécutives. Une alerte pastorale de niveau « ${alert.level} » a été détectée.`,

      occurredAt:
        alert.detectedAt ||
        new Date(),

      previousValue:
        "",

      newValue:
        alert.level,

      sourceType:
        "PastoralAlert",

      sourceId:
        alert._id,

      metadata:
        buildAlertHistoryMetadata(
          alert
        ),

      origin:
        "automatic",

      visibility:
        "standard",
    });
  };

// ======================================================
// HISTORIQUE — ALERTE MODIFIÉE
// ======================================================

const createPastoralAlertUpdatedHistory =
  async ({
    req = null,
    churchId,
    member,
    alert,
    previousValue,
    newValue,
    description,
    changes = {},
    origin = "automatic",
  }) => {
    const fullName =
      getMemberFullName(member);

    await safeCreatePersonHistory({
      req,

      churchId,

      memberId:
        member._id,

      type:
        "PASTORAL_ALERT_UPDATED",

      category:
        "Suivi pastoral",

      title:
        "Suivi pastoral mis à jour",

      description:
        description ||
        `Le suivi pastoral de ${fullName} a été mis à jour.`,

      occurredAt:
        new Date(),

      previousValue:
        previousValue || "",

      newValue:
        newValue || "",

      sourceType:
        "PastoralAlert",

      sourceId:
        alert._id,

      metadata:
        buildAlertHistoryMetadata(
          alert,
          {
            changes,
          }
        ),

      origin,

      visibility:
        "standard",
    });
  };

// ======================================================
// HISTORIQUE — ALERTE RÉSOLUE
// ======================================================

const createPastoralAlertResolvedHistory =
  async ({
    req = null,
    churchId,
    member,
    alert,
    previousStatus = "",
    automatic = false,
  }) => {
    const fullName =
      getMemberFullName(member);

    await safeCreatePersonHistory({
      req,

      churchId,

      memberId:
        member._id,

      type:
        "PASTORAL_ALERT_RESOLVED",

      category:
        "Suivi pastoral",

      title:
        "Alerte pastorale résolue",

      description:
        automatic
          ? `L'alerte pastorale de ${fullName} a été résolue automatiquement par Eldior après détection d'un retour ou de la disparition de l'anomalie.`
          : `L'alerte pastorale de ${fullName} a été résolue.`,

      occurredAt:
        alert.resolvedAt ||
        new Date(),

      previousValue:
        previousStatus,

      newValue:
        "Résolue",

      sourceType:
        "PastoralAlert",

      sourceId:
        alert._id,

      metadata:
        buildAlertHistoryMetadata(
          alert,
          {
            automatic,
          }
        ),

      origin:
        automatic
          ? "automatic"
          : "manual",

      visibility:
        "standard",
    });
  };

// ======================================================
// POPULATE D'UNE ALERTE
// ======================================================

const populateAlert = async (alert) => {
  if (!alert) {
    return alert;
  }

  await alert.populate([
    {
      path: "member",
      select:
        "firstName lastName phone email status membershipType ageGroup gender department family spiritualStage followUpStatus membershipDate firstVisitDate integratedAt wasVisitor",
      populate: [
        {
          path: "department",
          select: "name",
        },
        {
          path: "family",
          select: "name",
        },
      ],
    },
    {
      path: "assignedTo",
      select:
        "name email role",
    },
    {
      path: "resolvedBy",
      select:
        "name email role",
    },
  ]);

  return alert;
};

// ======================================================
// ANALYSER L'ABSENCE D'UNE PERSONNE
// ======================================================

const analyzeMemberAbsence = ({
  member,
  services,
  attendanceMap,
}) => {
  const trackingStartDate =
    getAttendanceTrackingStartDate(
      member
    );

  const eligibleServices =
    services.filter((service) => {
      const serviceDate =
        normalizeDate(service.date);

      if (!serviceDate) {
        return false;
      }

      if (!trackingStartDate) {
        return true;
      }

      return (
        serviceDate.getTime() >=
        trackingStartDate.getTime()
      );
    });

  let consecutiveMissedServices = 0;
  let lastPresenceDate = null;

  const recentHistory = [];

  for (const service of eligibleServices) {
    const key =
      `${member._id.toString()}_${service._id.toString()}`;

    const attendance =
      attendanceMap.get(key);

    const status =
      attendance?.status ||
      "Non pointé";

    recentHistory.push({
      eventId: service._id,
      title: service.title,
      date: service.date,
      status,
      excused:
        status === "Excusé",
    });

    if (
      isPresentStatus(status)
    ) {
      lastPresenceDate =
        service.date;

      break;
    }

    consecutiveMissedServices += 1;
  }

  return {
    trackingStartDate,

    eligibleServicesCount:
      eligibleServices.length,

    consecutiveMissedServices,

    lastPresenceDate,

    daysSinceLastPresence:
      lastPresenceDate
        ? calculateDaysSince(
            lastPresenceDate
          )
        : null,

    recentHistory,
  };
};

// ======================================================
// DERNIÈRE PRÉSENCE HISTORIQUE
// ======================================================

const getHistoricalLastPresence =
  async ({
    churchId,
    memberId,
    trackingStartDate,
  }) => {
    const eventFilter = {
      church: churchId,

      isSundayService: true,

      status: {
        $nin: [
          "Annulé",
          "cancelled",
        ],
      },

      date: {
        $lte: new Date(),
      },
    };

    if (trackingStartDate) {
      eventFilter.date.$gte =
        trackingStartDate;
    }

    const eligibleEventIds =
      await Event.find(
        eventFilter
      )
        .select("_id")
        .lean();

    if (
      eligibleEventIds.length === 0
    ) {
      return null;
    }

    const eventIds =
      eligibleEventIds.map(
        (event) => event._id
      );

    const attendance =
      await Attendance.findOne({
        church: churchId,

        member: memberId,

        event: {
          $in: eventIds,
        },

        status: {
          $in: PRESENT_STATUSES,
        },
      })
        .populate({
          path: "event",
          select: "date",
        })
        .lean();

    if (!attendance) {
      return null;
    }

    const allPresentAttendances =
      await Attendance.find({
        church: churchId,

        member: memberId,

        event: {
          $in: eventIds,
        },

        status: {
          $in: PRESENT_STATUSES,
        },
      })
        .populate({
          path: "event",
          select: "date",
        })
        .lean();

    let latestDate = null;

    for (
      const item of
      allPresentAttendances
    ) {
      const eventDate =
        normalizeDate(
          item.event?.date
        );

      if (!eventDate) {
        continue;
      }

      if (
        !latestDate ||
        eventDate.getTime() >
          latestDate.getTime()
      ) {
        latestDate =
          eventDate;
      }
    }

    return latestDate;
  };

// ======================================================
// POST /api/pastoral-alerts/scan
// ======================================================

exports.scanProlongedAbsences =
  async (req, res, next) => {
    try {
      const now =
        new Date();

      const churchId =
        req.churchId;

      // ==================================================
      // CULTES PASSÉS
      // ==================================================

      const services =
        await Event.find({
          church: churchId,

          isSundayService: true,

          date: {
            $lte: now,
          },

          status: {
            $nin: [
              "Annulé",
              "cancelled",
            ],
          },
        })
          .sort({
            date: -1,
          })
          .limit(
            MAX_SERVICES_TO_ANALYZE
          )
          .lean();

      if (
        services.length === 0
      ) {
        return res
          .status(200)
          .json({
            success: true,

            message:
              "Aucun culte du dimanche passé à analyser.",

            data: {
              scannedMembers: 0,
              scannedServices: 0,
              activeAlerts: 0,
              created: 0,
              updated: 0,
              automaticallyResolved: 0,
              ignoredNotEnoughHistory: 0,
            },
          });
      }

      // ==================================================
      // MEMBRES ACTIFS
      // ==================================================

      const members =
        await Member.find({
          church: churchId,

          status:
            "Actif",

          membershipType:
            "Membre",
        })
          .select(
            "_id firstName lastName membershipDate firstVisitDate integratedAt wasVisitor createdAt"
          )
          .lean();

      const memberMap =
        new Map(
          members.map(
            (member) => [
              member._id.toString(),
              member,
            ]
          )
        );

      const serviceIds =
        services.map(
          (service) =>
            service._id
        );

      const memberIds =
        members.map(
          (member) =>
            member._id
        );

      // ==================================================
      // POINTAGES
      // ==================================================

      const attendances =
        await Attendance.find({
          church: churchId,

          member: {
            $in:
              memberIds,
          },

          event: {
            $in:
              serviceIds,
          },
        })
          .select(
            "member event status"
          )
          .lean();

      const attendanceMap =
        new Map();

      for (
        const attendance of
        attendances
      ) {
        const key =
          `${attendance.member.toString()}_${attendance.event.toString()}`;

        attendanceMap.set(
          key,
          attendance
        );
      }

      let created = 0;
      let updated = 0;

      let automaticallyResolved =
        0;

      let ignoredNotEnoughHistory =
        0;

      const detectedMemberIds =
        [];

      // ==================================================
      // ANALYSE DE CHAQUE MEMBRE
      // ==================================================

      for (const member of members) {
        const analysis =
          analyzeMemberAbsence({
            member,
            services,
            attendanceMap,
          });

        if (
          analysis
            .eligibleServicesCount <
          MIN_MISSED_SERVICES
        ) {
          ignoredNotEnoughHistory +=
            1;

          continue;
        }

        const missedCount =
          analysis
            .consecutiveMissedServices;

        if (
          missedCount >=
          MIN_MISSED_SERVICES
        ) {
          detectedMemberIds.push(
            member._id
          );

          let lastPresenceDate =
            analysis
              .lastPresenceDate;

          if (
            !lastPresenceDate
          ) {
            lastPresenceDate =
              await getHistoricalLastPresence({
                churchId,

                memberId:
                  member._id,

                trackingStartDate:
                  analysis
                    .trackingStartDate,
              });
          }

          const daysSinceLastPresence =
            lastPresenceDate
              ? calculateDaysSince(
                  lastPresenceDate,
                  now
                )
              : null;

          const level =
            getAlertLevel(
              missedCount
            );

          const existingAlert =
            await PastoralAlert.findOne({
              church:
                churchId,

              member:
                member._id,

              type:
                "Absence prolongée",
            });

          // ==================================================
          // ALERTE EXISTANTE
          // ==================================================

          if (existingAlert) {
            const previousLevel =
              existingAlert.level;

            const previousStatus =
              existingAlert.status;

            const previousMissedCount =
              existingAlert
                .consecutiveMissedServices;

            const wasResolved =
              existingAlert.status ===
              "Résolue";

            existingAlert.level =
              level;

            existingAlert.consecutiveMissedServices =
              missedCount;

            existingAlert.lastPresenceDate =
              lastPresenceDate;

            existingAlert.daysSinceLastPresence =
              daysSinceLastPresence;

            existingAlert.lastCheckedServiceDate =
              services[0]?.date ||
              null;

            existingAlert.lastDetectedAt =
              now;

            if (wasResolved) {
              existingAlert.status =
                "Ouverte";

              existingAlert.resolvedAt =
                null;

              existingAlert.resolvedBy =
                null;

              existingAlert.detectedAt =
                now;
            }

            await existingAlert.save();

            updated += 1;

            // ------------------------------------------------
            // Ne créer un historique que lorsqu'un changement
            // pastoral significatif a réellement eu lieu.
            // ------------------------------------------------

            const levelChanged =
              previousLevel !==
              existingAlert.level;

            const statusChanged =
              previousStatus !==
              existingAlert.status;

            const missedCountChanged =
              previousMissedCount !==
              existingAlert
                .consecutiveMissedServices;

            if (
              levelChanged ||
              statusChanged ||
              missedCountChanged
            ) {
              const changes = {
                previousLevel,
                newLevel:
                  existingAlert.level,

                previousStatus,
                newStatus:
                  existingAlert.status,

                previousConsecutiveMissedServices:
                  previousMissedCount,

                newConsecutiveMissedServices:
                  existingAlert
                    .consecutiveMissedServices,

                reopened:
                  wasResolved,
              };

              let description =
                `Le suivi pastoral de ${getMemberFullName(member)} a été mis à jour.`;

              if (wasResolved) {
                description =
                  `Une nouvelle période d'absence prolongée a été détectée pour ${getMemberFullName(member)}. L'alerte pastorale a été réouverte.`;
              } else if (
                levelChanged
              ) {
                description =
                  `Le niveau de vigilance pastorale de ${getMemberFullName(member)} est passé de « ${previousLevel} » à « ${existingAlert.level} » après ${existingAlert.consecutiveMissedServices} absences consécutives.`;
              }

              await createPastoralAlertUpdatedHistory({
                req: null,

                churchId,

                member,

                alert:
                  existingAlert,

                previousValue:
                  wasResolved
                    ? previousStatus
                    : previousLevel,

                newValue:
                  wasResolved
                    ? existingAlert.status
                    : existingAlert.level,

                description,

                changes,

                origin:
                  "automatic",
              });
            }
          } else {
            // ==================================================
            // NOUVELLE ALERTE
            // ==================================================

            const newAlert =
              await PastoralAlert.create({
                church:
                  churchId,

                member:
                  member._id,

                type:
                  "Absence prolongée",

                level,

                consecutiveMissedServices:
                  missedCount,

                lastPresenceDate,

                daysSinceLastPresence,

                lastCheckedServiceDate:
                  services[0]?.date ||
                  null,

                status:
                  "Ouverte",

                detectedAt:
                  now,

                lastDetectedAt:
                  now,
              });

            created += 1;

            await createPastoralAlertCreatedHistory({
              req: null,

              churchId,

              member,

              alert:
                newAlert,
            });
          }
        }
      }

      // ==================================================
      // RÉSOLUTION AUTOMATIQUE
      // ==================================================

      const activeAlerts =
        await PastoralAlert.find({
          church:
            churchId,

          type:
            "Absence prolongée",

          status: {
            $ne:
              "Résolue",
          },
        });

      for (
        const alert of
        activeAlerts
      ) {
        const stillDetected =
          detectedMemberIds.some(
            (memberId) =>
              memberId.toString() ===
              alert.member.toString()
          );

        if (!stillDetected) {
          const previousStatus =
            alert.status;

          alert.status =
            "Résolue";

          alert.resolvedAt =
            now;

          alert.resolvedBy =
            null;

          const automaticNote =
            "Retour ou absence d'anomalie détecté automatiquement par Eldior.";

          if (
            !alert.note.includes(
              automaticNote
            )
          ) {
            alert.note =
              alert.note
                ? `${alert.note}\n${automaticNote}`
                : automaticNote;
          }

          await alert.save();

          automaticallyResolved +=
            1;

          // ------------------------------------------------
          // Historique de résolution automatique
          // ------------------------------------------------

          let member =
            memberMap.get(
              alert.member.toString()
            );

          /*
           * Une alerte active peut éventuellement
           * concerner une personne qui n'est plus dans
           * la requête "membres actifs".
           *
           * On la récupère donc si nécessaire.
           */

          if (!member) {
            member =
              await Member.findOne({
                _id:
                  alert.member,

                church:
                  churchId,
              })
                .select(
                  "_id firstName lastName"
                )
                .lean();
          }

          if (member) {
            await createPastoralAlertResolvedHistory({
              req: null,

              churchId,

              member,

              alert,

              previousStatus,

              automatic:
                true,
            });
          }
        }
      }

      // ==================================================
      // NOMBRE D'ALERTES ACTIVES
      // ==================================================

      const currentActiveAlerts =
        await PastoralAlert.countDocuments({
          church:
            churchId,

          type:
            "Absence prolongée",

          status: {
            $ne:
              "Résolue",
          },
        });

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Analyse intelligente des absences prolongées terminée.",

          data: {
            scannedMembers:
              members.length,

            scannedServices:
              services.length,

            activeAlerts:
              currentActiveAlerts,

            created,

            updated,

            automaticallyResolved,

            ignoredNotEnoughHistory,
          },
        });
    } catch (error) {
      next(error);
    }
  };

// ======================================================
// GET /api/pastoral-alerts
// ======================================================

exports.getPastoralAlerts =
  async (req, res, next) => {
    try {
      const {
        status,
        level,
        assignedTo,
        search,
      } = req.query;

      const query = {
        church:
          req.churchId,
      };

      if (status) {
        query.status =
          status;
      }

      if (level) {
        query.level =
          level;
      }

      if (
        assignedTo &&
        isValidObjectId(
          assignedTo
        )
      ) {
        query.assignedTo =
          assignedTo;
      }

      if (
        typeof search ===
          "string" &&
        search.trim()
      ) {
        const regex =
          new RegExp(
            search.trim(),
            "i"
          );

        const members =
          await Member.find({
            church:
              req.churchId,

            $or: [
              {
                firstName:
                  regex,
              },
              {
                lastName:
                  regex,
              },
              {
                phone:
                  regex,
              },
              {
                email:
                  regex,
              },
            ],
          })
            .select("_id")
            .lean();

        query.member = {
          $in:
            members.map(
              (member) =>
                member._id
            ),
        };
      }

      const alerts =
        await PastoralAlert.find(
          query
        )
          .populate({
            path:
              "member",

            select:
              "firstName lastName phone email status membershipType ageGroup gender spiritualStage followUpStatus membershipDate firstVisitDate integratedAt wasVisitor",
          })
          .populate(
            "assignedTo",
            "name email role"
          )
          .populate(
            "resolvedBy",
            "name email role"
          )
          .sort({
            detectedAt: -1,
          });

      return res
        .status(200)
        .json({
          success: true,

          count:
            alerts.length,

          data:
            alerts,
        });
    } catch (error) {
      next(error);
    }
  };

// ======================================================
// GET /api/pastoral-alerts/stats
// ======================================================

exports.getPastoralAlertStats =
  async (req, res, next) => {
    try {
      const churchId =
        req.churchId;

      const [
        totalOpen,
        attention,
        followUp,
        critical,
        inProgress,
        resolved,
        unassigned,
      ] =
        await Promise.all([
          PastoralAlert.countDocuments({
            church:
              churchId,

            status: {
              $ne:
                "Résolue",
            },
          }),

          PastoralAlert.countDocuments({
            church:
              churchId,

            status: {
              $ne:
                "Résolue",
            },

            level:
              "Attention",
          }),

          PastoralAlert.countDocuments({
            church:
              churchId,

            status: {
              $ne:
                "Résolue",
            },

            level:
              "À suivre",
          }),

          PastoralAlert.countDocuments({
            church:
              churchId,

            status: {
              $ne:
                "Résolue",
            },

            level:
              "Critique",
          }),

          PastoralAlert.countDocuments({
            church:
              churchId,

            status:
              "En cours",
          }),

          PastoralAlert.countDocuments({
            church:
              churchId,

            status:
              "Résolue",
          }),

          PastoralAlert.countDocuments({
            church:
              churchId,

            status: {
              $ne:
                "Résolue",
            },

            assignedTo:
              null,
          }),
        ]);

      return res
        .status(200)
        .json({
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

exports.getMemberPastoralAlerts =
  async (req, res, next) => {
    try {
      const {
        memberId,
      } = req.params;

      if (
        !isValidObjectId(
          memberId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant de personne invalide.",
          });
      }

      const member =
        await Member.findOne({
          _id:
            memberId,

          church:
            req.churchId,
        })
          .select(
            "_id firstName lastName"
          )
          .lean();

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Personne introuvable.",
          });
      }

      const alerts =
        await PastoralAlert.find({
          church:
            req.churchId,

          member:
            memberId,
        })
          .populate(
            "assignedTo",
            "name email role"
          )
          .populate(
            "resolvedBy",
            "name email role"
          )
          .sort({
            detectedAt: -1,
          });

      return res
        .status(200)
        .json({
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

exports.getPastoralAlertById =
  async (req, res, next) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant d'alerte invalide.",
          });
      }

      const alert =
        await PastoralAlert.findOne({
          _id:
            id,

          church:
            req.churchId,
        });

      if (!alert) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Alerte pastorale introuvable.",
          });
      }

      await populateAlert(
        alert
      );

      return res
        .status(200)
        .json({
          success: true,

          data:
            alert,
        });
    } catch (error) {
      next(error);
    }
  };

// ======================================================
// PUT /api/pastoral-alerts/:id
// ======================================================

exports.updatePastoralAlert =
  async (req, res, next) => {
    try {
      const {
        id,
      } = req.params;

      const {
        status,
        assignedTo,
        note,
        contacted,
      } = req.body;

      if (
        !isValidObjectId(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant d'alerte invalide.",
          });
      }

      const alert =
        await PastoralAlert.findOne({
          _id:
            id,

          church:
            req.churchId,
        });

      if (!alert) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Alerte pastorale introuvable.",
          });
      }

      // ==================================================
      // ÉTAT AVANT MODIFICATION
      // ==================================================

      const previousState = {
        status:
          alert.status,

        assignedTo:
          alert.assignedTo
            ? alert.assignedTo.toString()
            : null,

        note:
          alert.note || "",

        contactedAt:
          alert.contactedAt ||
          null,

        resolvedAt:
          alert.resolvedAt ||
          null,

        resolvedBy:
          alert.resolvedBy
            ? alert.resolvedBy.toString()
            : null,
      };

      // ==================================================
      // STATUT
      // ==================================================

      if (
        status !== undefined
      ) {
        const statuses = [
          "Ouverte",
          "En cours",
          "Résolue",
        ];

        if (
          !statuses.includes(
            status
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Statut d'alerte invalide.",
            });
        }

        alert.status =
          status;

        if (
          status ===
          "Résolue"
        ) {
          /*
           * On ne réécrit pas inutilement resolvedAt
           * à chaque PUT si l'alerte était déjà résolue.
           */

          if (
            previousState.status !==
            "Résolue"
          ) {
            alert.resolvedAt =
              new Date();

            alert.resolvedBy =
              req.user?._id ||
              null;
          }
        } else {
          alert.resolvedAt =
            null;

          alert.resolvedBy =
            null;
        }
      }

      // ==================================================
      // RESPONSABLE
      // ==================================================

      if (
        assignedTo !==
        undefined
      ) {
        if (
          assignedTo === "" ||
          assignedTo === null
        ) {
          alert.assignedTo =
            null;
        } else {
          if (
            !isValidObjectId(
              assignedTo
            )
          ) {
            return res
              .status(400)
              .json({
                success: false,

                message:
                  "Responsable invalide.",
              });
          }

          alert.assignedTo =
            assignedTo;
        }
      }

      // ==================================================
      // NOTE
      // ==================================================

      if (
        note !== undefined
      ) {
        alert.note =
          typeof note ===
          "string"
            ? note.trim()
            : "";
      }

      // ==================================================
      // CONTACT
      // ==================================================

      if (
        contacted === true
      ) {
        alert.contactedAt =
          new Date();

        if (
          alert.status ===
          "Ouverte"
        ) {
          alert.status =
            "En cours";
        }
      }

      // ==================================================
      // SAUVEGARDE
      // ==================================================

      await alert.save();

      // ==================================================
      // HISTORIQUE PERSONNE
      // ==================================================

      const member =
        await Member.findOne({
          _id:
            alert.member,

          church:
            req.churchId,
        })
          .select(
            "_id firstName lastName"
          )
          .lean();

      if (member) {
        const currentAssignedTo =
          alert.assignedTo
            ? alert.assignedTo.toString()
            : null;

        const statusChanged =
          previousState.status !==
          alert.status;

        const assignedToChanged =
          previousState.assignedTo !==
          currentAssignedTo;

        const noteChanged =
          previousState.note !==
          (alert.note || "");

        const contactChanged =
          contacted === true;

        const justResolved =
          previousState.status !==
            "Résolue" &&
          alert.status ===
            "Résolue";

        // ------------------------------------------------
        // RÉSOLUTION
        // ------------------------------------------------

        if (justResolved) {
          await createPastoralAlertResolvedHistory({
            req,

            churchId:
              req.churchId,

            member,

            alert,

            previousStatus:
              previousState.status,

            automatic:
              false,
          });
        } else {
          // ------------------------------------------------
          // MISE À JOUR SIGNIFICATIVE
          // ------------------------------------------------

          const meaningfulChange =
            statusChanged ||
            assignedToChanged ||
            contactChanged;

          /*
           * Une simple correction de note n'ajoute pas
           * automatiquement un événement dans la timeline.
           *
           * La note reste dans PastoralAlert.
           * Cela évite de surcharger le Profil 360°.
           */

          if (meaningfulChange) {
            const changes = {
              previousStatus:
                previousState.status,

              newStatus:
                alert.status,

              previousAssignedTo:
                previousState.assignedTo,

              newAssignedTo:
                currentAssignedTo,

              contacted:
                contactChanged,

              contactedAt:
                alert.contactedAt ||
                null,

              noteChanged,
            };

            let description =
              `Le suivi pastoral de ${getMemberFullName(member)} a été mis à jour.`;

            let previousValue =
              previousState.status ||
              "";

            let newValue =
              alert.status || "";

            if (contactChanged) {
              description =
                `${getMemberFullName(member)} a été contacté dans le cadre de son suivi pastoral.`;

              previousValue =
                previousState.status ||
                "";

              newValue =
                alert.status ||
                "En cours";
            } else if (
              assignedToChanged
            ) {
              description =
                `Le responsable du suivi pastoral de ${getMemberFullName(member)} a été modifié.`;

              previousValue =
                previousState.assignedTo ||
                "Non assigné";

              newValue =
                currentAssignedTo ||
                "Non assigné";
            } else if (
              statusChanged
            ) {
              description =
                `Le statut du suivi pastoral de ${getMemberFullName(member)} est passé de « ${previousState.status} » à « ${alert.status} ».`;
            }

            await createPastoralAlertUpdatedHistory({
              req,

              churchId:
                req.churchId,

              member,

              alert,

              previousValue,

              newValue,

              description,

              changes,

              origin:
                "manual",
            });
          }
        }
      }

      // ==================================================
      // POPULATE
      // ==================================================

      await populateAlert(
        alert
      );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Alerte pastorale mise à jour.",

          data:
            alert,
        });
    } catch (error) {
      next(error);
    }
  };