const mongoose = require("mongoose");

const Member = require("../models/Member");
const Event = require("../models/Event");
const Attendance = require("../models/Attendance");
const PastoralAlert = require("../models/PastoralAlert");

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

  /*
   * On ne garde que les cultes qui ont eu lieu
   * depuis l'entrée réelle de la personne
   * dans le suivi.
   */

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

  /*
   * services est trié du plus récent
   * au plus ancien.
   *
   * On remonte jusqu'à la dernière présence.
   */

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

  /*
   * Si aucune présence n'a été trouvée parmi
   * les cultes analysés, on cherche tout de même
   * à connaître la dernière présence historique.
   *
   * Cette recherche sera faite séparément
   * pendant le scan.
   */

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

    /*
     * findOne ne garantit pas ici que l'événement
     * associé est le plus récent.
     *
     * On récupère donc toutes les présences si
     * nécessaire pour trouver correctement
     * la dernière.
     */

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
      const now = new Date();
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

          status: "Actif",

          membershipType:
            "Membre",
        })
          .select(
            "_id firstName lastName membershipDate firstVisitDate integratedAt wasVisitor createdAt"
          )
          .lean();

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
            $in: memberIds,
          },

          event: {
            $in: serviceIds,
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

        /*
         * Protection essentielle :
         *
         * Il faut au moins deux cultes réellement
         * survenus depuis l'entrée de la personne
         * avant de pouvoir déclencher une alerte.
         */

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

          /*
           * Si aucune présence n'a été trouvée
           * dans la fenêtre des 12 cultes,
           * on cherche dans l'historique.
           */

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
              church: churchId,

              member:
                member._id,

              type:
                "Absence prolongée",
            });

          if (existingAlert) {
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

            /*
             * Si la personne avait déjà eu
             * une alerte résolue puis recommence
             * à s'absenter, on réouvre l'alerte.
             */

            if (
              existingAlert.status ===
              "Résolue"
            ) {
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
          } else {
            await PastoralAlert.create({
              church: churchId,

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

              detectedAt: now,

              lastDetectedAt:
                now,
            });

            created += 1;
          }
        }
      }

      // ==================================================
      // RÉSOLUTION AUTOMATIQUE
      // ==================================================

      const activeAlerts =
        await PastoralAlert.find({
          church: churchId,

          type:
            "Absence prolongée",

          status: {
            $ne: "Résolue",
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
          alert.status =
            "Résolue";

          alert.resolvedAt =
            now;

          alert.resolvedBy =
            null;

          const automaticNote =
            "Retour ou absence d'anomalie détecté automatiquement par Eldior.";

          /*
           * On évite d'ajouter la même note
           * plusieurs fois.
           */

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
        }
      }

      // ==================================================
      // NOMBRE D'ALERTES ACTIVES
      // ==================================================

      const currentActiveAlerts =
        await PastoralAlert.countDocuments({
          church: churchId,

          type:
            "Absence prolongée",

          status: {
            $ne: "Résolue",
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
            path: "member",

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
            church: churchId,
            status: {
              $ne: "Résolue",
            },
          }),

          PastoralAlert.countDocuments({
            church: churchId,
            status: {
              $ne: "Résolue",
            },
            level:
              "Attention",
          }),

          PastoralAlert.countDocuments({
            church: churchId,
            status: {
              $ne: "Résolue",
            },
            level:
              "À suivre",
          }),

          PastoralAlert.countDocuments({
            church: churchId,
            status: {
              $ne: "Résolue",
            },
            level:
              "Critique",
          }),

          PastoralAlert.countDocuments({
            church: churchId,
            status:
              "En cours",
          }),

          PastoralAlert.countDocuments({
            church: churchId,
            status:
              "Résolue",
          }),

          PastoralAlert.countDocuments({
            church: churchId,
            status: {
              $ne: "Résolue",
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
      const { memberId } =
        req.params;

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
          _id: memberId,
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
      const { id } =
        req.params;

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
          _id: id,
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
          data: alert,
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
      const { id } =
        req.params;

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
          _id: id,
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
          alert.resolvedAt =
            new Date();

          alert.resolvedBy =
            req.user?._id ||
            null;
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

      await alert.save();

      await populateAlert(
        alert
      );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Alerte pastorale mise à jour.",

          data: alert,
        });
    } catch (error) {
      next(error);
    }
  };