const mongoose = require("mongoose");

const Member = require("../models/Member");
const Family = require("../models/Family");
const Group = require("../models/Group");
const Department = require("../models/Department");
const Attendance = require("../models/Attendance");
const PastoralAlert = require("../models/PastoralAlert");
const PersonHistory = require("../models/PersonHistory");
const User = require("../models/User");

// ======================================================
// VERSION DU BACKFILL
// ======================================================

const BACKFILL_VERSION = "person-history-v1";

// ======================================================
// UTILITAIRES
// ======================================================

const toIdString = (value) => {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    value._id
  ) {
    return value._id.toString();
  }

  return value.toString();
};

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

const safeText = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
};

const buildMemberName = (member) => {
  if (!member) {
    return "Personne";
  }

  const firstName =
    safeText(member.firstName);

  const lastName =
    safeText(member.lastName);

  const fullName =
    `${firstName} ${lastName}`.trim();

  return fullName || "Personne";
};

// ======================================================
// CACHE UTILISATEURS
// ======================================================

const userCache = new Map();

const getUserIdentity = async (
  userId
) => {
  const id =
    toIdString(userId);

  if (!id) {
    return {
      createdBy: null,
      createdByName: "Système",
    };
  }

  if (userCache.has(id)) {
    return userCache.get(id);
  }

  try {
    const user =
      await User.findById(id)
        .select("_id name email")
        .lean();

    const identity = user
      ? {
          createdBy: user._id,
          createdByName:
            safeText(user.name) ||
            safeText(user.email) ||
            "Utilisateur",
        }
      : {
          createdBy: null,
          createdByName:
            "Système",
        };

    userCache.set(
      id,
      identity
    );

    return identity;
  } catch (error) {
    const identity = {
      createdBy: null,
      createdByName:
        "Système",
    };

    userCache.set(
      id,
      identity
    );

    return identity;
  }
};

// ======================================================
// STATISTIQUES DU BACKFILL
// ======================================================

const createStats = () => ({
  created: 0,
  reused: 0,
  skipped: 0,
  errors: 0,

  byType: {},

  sources: {
    members: 0,
    families: 0,
    groups: 0,
    departments: 0,
    attendances: 0,
    pastoralAlerts: 0,
  },
});

const incrementType = (
  stats,
  type
) => {
  if (!type) {
    return;
  }

  stats.byType[type] =
    (stats.byType[type] || 0) +
    1;
};

// ======================================================
// RECHERCHE D'UN ÉVÉNEMENT HISTORIQUE ÉQUIVALENT
// ======================================================

/**
 * Certains événements ont déjà été créés avant le
 * lancement du backfill mais n'ont pas encore de
 * dedupeKey.
 *
 * Exemple :
 * - PERSON_CREATED de Marie
 * - SPIRITUAL_STAGE_CHANGED de David
 * - événements de tests déjà validés
 *
 * On cherche donc d'abord :
 *
 * 1. la dedupeKey exacte ;
 * 2. à défaut, un événement sémantiquement équivalent
 *    au même moment.
 *
 * Cela évite de créer un doublon simplement parce que
 * l'événement historique préexistant possède
 * dedupeKey: null.
 */
const findEquivalentHistory =
  async ({
    churchId,
    memberId,
    type,
    occurredAt,
    dedupeKey,
    sourceType = null,
    sourceId = null,
  }) => {
    if (
      !churchId ||
      !memberId ||
      !type
    ) {
      return null;
    }

    // --------------------------------------------------
    // 1. Recherche via dedupeKey
    // --------------------------------------------------

    if (dedupeKey) {
      const existingByKey =
        await PersonHistory.findOne({
          church: churchId,
          dedupeKey,
        });

      if (existingByKey) {
        return existingByKey;
      }
    }

    // --------------------------------------------------
    // 2. Recherche sémantique
    // --------------------------------------------------

    const date =
      normalizeDate(occurredAt);

    if (!date) {
      return null;
    }

    /*
     * Tolérance de 2 secondes.
     *
     * Certains événements existants ont pu être créés
     * quelques millisecondes après l'action métier.
     */
    const start =
      new Date(
        date.getTime() - 2000
      );

    const end =
      new Date(
        date.getTime() + 2000
      );

    const query = {
      church: churchId,
      member: memberId,
      type,
      occurredAt: {
        $gte: start,
        $lte: end,
      },
    };

    if (
      sourceType &&
      sourceId
    ) {
      const sourceQuery = {
        ...query,
        $or: [
          {
            sourceType,
            sourceId,
          },
          {
            sourceId,
          },
          {
            sourceType,
          },
          {
            sourceType: null,
            sourceId: null,
          },
        ],
      };

      const sourceMatch =
        await PersonHistory.findOne(
          sourceQuery
        ).sort({
          occurredAt: 1,
        });

      if (sourceMatch) {
        return sourceMatch;
      }
    }

    return PersonHistory.findOne(
      query
    ).sort({
      occurredAt: 1,
    });
  };

// ======================================================
// CRÉATION IDEMPOTENTE D'UN ÉVÉNEMENT
// ======================================================

const ensureHistoryEvent =
  async ({
    stats,
    dryRun = false,

    churchId,
    memberId,

    type,
    category,

    title,
    description = "",

    occurredAt,

    previousValue = "",
    newValue = "",

    sourceType = null,
    sourceId = null,

    dedupeKey,

    metadata = {},

    createdBy = null,
    createdByName =
      "Système",

    origin = "automatic",
    visibility = "standard",
  }) => {
    try {
      const date =
        normalizeDate(
          occurredAt
        );

      if (
        !churchId ||
        !memberId ||
        !type ||
        !category ||
        !title ||
        !date ||
        !dedupeKey
      ) {
        stats.skipped += 1;

        return {
          status: "skipped",
          reason:
            "Données historiques insuffisantes.",
        };
      }

      const existing =
        await findEquivalentHistory({
          churchId,
          memberId,
          type,
          occurredAt: date,
          dedupeKey,
          sourceType,
          sourceId,
        });

      // ------------------------------------------------
      // Événement déjà présent
      // ------------------------------------------------

      if (existing) {
        /*
         * Si l'événement existe déjà mais qu'il a été
         * créé avant l'introduction de dedupeKey,
         * on lui rattache la clé du backfill.
         *
         * Cela le protège lors des prochains passages.
         */
        if (
          !dryRun &&
          !existing.dedupeKey
        ) {
          try {
            existing.dedupeKey =
              dedupeKey;

            await existing.save();
          } catch (error) {
            /*
             * Une autre ligne peut déjà porter cette clé.
             * Dans ce cas, aucune interruption.
             */
            if (
              error?.code !==
              11000
            ) {
              throw error;
            }
          }
        }

        stats.reused += 1;

        return {
          status: "reused",
          history: existing,
        };
      }

      // ------------------------------------------------
      // Mode prévisualisation
      // ------------------------------------------------

      if (dryRun) {
        stats.created += 1;

        incrementType(
          stats,
          type
        );

        return {
          status:
            "would-create",
        };
      }

      // ------------------------------------------------
      // Création réelle
      // ------------------------------------------------

      const history =
        await PersonHistory.create({
          church:
            churchId,

          member:
            memberId,

          type,
          category,

          title:
            safeText(title),

          description:
            safeText(
              description
            ),

          occurredAt:
            date,

          previousValue:
            safeText(
              previousValue
            ),

          newValue:
            safeText(
              newValue
            ),

          sourceType,
          sourceId,

          dedupeKey,

          metadata: {
            ...metadata,

            backfilled:
              true,

            backfillVersion:
              BACKFILL_VERSION,
          },

          createdBy:
            createdBy ||
            null,

          createdByName:
            safeText(
              createdByName
            ) ||
            "Système",

          origin,

          visibility,
        });

      stats.created += 1;

      incrementType(
        stats,
        type
      );

      return {
        status: "created",
        history,
      };
    } catch (error) {
      // ------------------------------------------------
      // Collision de dedupeKey
      // ------------------------------------------------

      if (
        error?.code === 11000
      ) {
        stats.reused += 1;

        return {
          status: "reused",
        };
      }

      console.error(
        "❌ Erreur backfill PersonHistory :",
        error
      );

      stats.errors += 1;

      return {
        status: "error",
        error,
      };
    }
  };

// ======================================================
// 1. MEMBRES
// ======================================================

const backfillMembers =
  async ({
    churchId,
    stats,
    dryRun,
  }) => {
    const members =
      await Member.find({
        church: churchId,
      }).lean();

    stats.sources.members =
      members.length;

    for (
      const member of members
    ) {
      const memberId =
        member._id;

      const memberName =
        buildMemberName(
          member
        );

      // ==================================================
      // PROFIL CRÉÉ
      // ==================================================

      if (member.createdAt) {
        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId,

          type:
            "PERSON_CREATED",

          category:
            "Identité",

          title:
            "Profil de la personne créé",

          description:
            `Le profil de ${memberName} a été créé dans Eldior.`,

          occurredAt:
            member.createdAt,

          previousValue:
            "",

          newValue:
            member.membershipType ||
            "",

          sourceType:
            "Member",

          sourceId:
            memberId,

          dedupeKey:
            `migration:member:created:${memberId}`,

          metadata: {
            membershipType:
              member.membershipType ||
              null,

            status:
              member.status ||
              null,

            legacyCreatedAt:
              member.createdAt,
          },
        });
      }

      // ==================================================
      // CONTACT VISITEUR HISTORIQUE
      // ==================================================

      if (
        member.lastContactDate
      ) {
        const actor =
          await getUserIdentity(
            member.followUpAssignedTo
          );

        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId,

          type:
            "VISITOR_CONTACT",

          category:
            "Visiteur",

          title:
            "Contact avec la personne",

          description:
            member.followUpNote
              ? member.followUpNote
              : `${memberName} a fait l'objet d'un suivi de contact.`,

          occurredAt:
            member.lastContactDate,

          previousValue:
            "",

          newValue:
            member.followUpStatus ||
            "Contacté",

          sourceType:
            "Member",

          sourceId:
            memberId,

          dedupeKey:
            `migration:visitor-contact:${memberId}:${new Date(
              member.lastContactDate
            ).getTime()}`,

          metadata: {
            followUpStatus:
              member.followUpStatus ||
              null,

            followUpNote:
              member.followUpNote ||
              "",

            nextFollowUpDate:
              member.nextFollowUpDate ||
              null,
          },

          ...actor,
        });
      }

      // ==================================================
      // VISITEUR INTÉGRÉ COMME MEMBRE
      // ==================================================

      if (
        member.wasVisitor ===
          true &&
        member.integratedAt
      ) {
        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId,

          type:
            "VISITOR_INTEGRATED",

          category:
            "Intégration",

          title:
            "Visiteur intégré",

          description:
            `${memberName} a été intégré comme membre de l'église.`,

          occurredAt:
            member.integratedAt,

          previousValue:
            "Visiteur",

          newValue:
            "Membre",

          sourceType:
            "Member",

          sourceId:
            memberId,

          dedupeKey:
            `migration:visitor-integrated:${memberId}`,

          metadata: {
            wasVisitor:
              true,

            integratedAt:
              member.integratedAt,

            membershipDate:
              member.membershipDate ||
              null,
          },
        });
      }

      // ==================================================
      // PARCOURS SPIRITUEL HISTORIQUE
      // ==================================================

      const journeyHistory =
        Array.isArray(
          member.spiritualJourneyHistory
        )
          ? [
              ...member.spiritualJourneyHistory,
            ]
          : [];

      journeyHistory.sort(
        (a, b) =>
          new Date(
            a.enteredAt || 0
          ).getTime() -
          new Date(
            b.enteredAt || 0
          ).getTime()
      );

      let previousStage = "";

      for (
        let index = 0;
        index <
        journeyHistory.length;
        index += 1
      ) {
        const entry =
          journeyHistory[index];

        if (
          !entry?.stage ||
          !entry?.enteredAt
        ) {
          continue;
        }

        const actor =
          await getUserIdentity(
            entry.changedBy
          );

        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId,

          type:
            "SPIRITUAL_STAGE_CHANGED",

          category:
            "Parcours spirituel",

          title:
            `Étape spirituelle — ${entry.stage}`,

          description:
            entry.note
              ? entry.note
              : `${memberName} est entré dans l'étape « ${entry.stage} » de son parcours.`,

          occurredAt:
            entry.enteredAt,

          previousValue:
            previousStage,

          newValue:
            entry.stage,

          sourceType:
            "Member",

          sourceId:
            memberId,

          dedupeKey:
            `migration:spiritual:${memberId}:${entry._id || index}`,

          metadata: {
            stage:
              entry.stage,

            enteredAt:
              entry.enteredAt,

            exitedAt:
              entry.exitedAt ||
              null,

            note:
              entry.note ||
              "",

            legacyJourneyEntryId:
              entry._id
                ? entry._id.toString()
                : null,
          },

          ...actor,
        });

        previousStage =
          entry.stage;
      }

      // ==================================================
      // ÉTAPE SPIRITUELLE ACTUELLE SANS HISTORIQUE
      // ==================================================

      if (
        journeyHistory.length ===
          0 &&
        member.spiritualStage &&
        member.spiritualStageSince
      ) {
        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId,

          type:
            "SPIRITUAL_STAGE_CHANGED",

          category:
            "Parcours spirituel",

          title:
            `Étape spirituelle — ${member.spiritualStage}`,

          description:
            `Étape spirituelle historique enregistrée pour ${memberName}.`,

          occurredAt:
            member.spiritualStageSince,

          previousValue:
            "",

          newValue:
            member.spiritualStage,

          sourceType:
            "Member",

          sourceId:
            memberId,

          dedupeKey:
            `migration:spiritual-current:${memberId}`,

          metadata: {
            stage:
              member.spiritualStage,

            spiritualStageSince:
              member.spiritualStageSince,

            legacyBaseline:
              true,
          },
        });
      }
    }
  };

// ======================================================
// 2. FAMILLES
// ======================================================

const backfillFamilies =
  async ({
    churchId,
    stats,
    dryRun,
  }) => {
    const families =
      await Family.find({
        church: churchId,
      }).lean();

    stats.sources.families =
      families.length;

    for (
      const family of families
    ) {
      const members =
        Array.isArray(
          family.members
        )
          ? family.members
          : [];

      for (
        const entry of members
      ) {
        if (
          !entry?.member ||
          !entry?.joinedAt
        ) {
          continue;
        }

        const member =
          await Member.findOne({
            _id: entry.member,
            church: churchId,
          })
            .select(
              "_id firstName lastName"
            )
            .lean();

        if (!member) {
          stats.skipped += 1;
          continue;
        }

        const memberName =
          buildMemberName(
            member
          );

        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId:
            member._id,

          type:
            "FAMILY_JOINED",

          category:
            "Famille",

          title:
            `Entrée dans la famille ${family.name}`,

          description:
            `${memberName} a rejoint la famille « ${family.name} ».`,

          occurredAt:
            entry.joinedAt,

          previousValue:
            "",

          newValue:
            entry.relationship ||
            "Autre",

          sourceType:
            "Family",

          sourceId:
            family._id,

          dedupeKey:
            `migration:family:joined:${family._id}:${member._id}`,

          metadata: {
            familyId:
              family._id,

            familyName:
              family.name,

            relationship:
              entry.relationship ||
              "Autre",

            headOfHousehold:
              family.headOfHousehold ||
              null,

            familyActive:
              family.isActive !==
              false,
          },
        });
      }
    }
  };

// ======================================================
// 3. GROUPES / CELLULES
// ======================================================

const backfillGroups =
  async ({
    churchId,
    stats,
    dryRun,
  }) => {
    const groups =
      await Group.find({
        church: churchId,
      }).lean();

    stats.sources.groups =
      groups.length;

    for (
      const group of groups
    ) {
      const members =
        Array.isArray(
          group.members
        )
          ? group.members
          : [];

      for (
        const entry of members
      ) {
        if (
          !entry?.member ||
          !entry?.joinedAt
        ) {
          continue;
        }

        const member =
          await Member.findOne({
            _id: entry.member,
            church: churchId,
          })
            .select(
              "_id firstName lastName"
            )
            .lean();

        if (!member) {
          stats.skipped += 1;
          continue;
        }

        const memberName =
          buildMemberName(
            member
          );

        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId:
            member._id,

          type:
            "GROUP_JOINED",

          category:
            "Groupe",

          title:
            `Entrée dans ${group.name}`,

          description:
            `${memberName} a rejoint le groupe « ${group.name} ».`,

          occurredAt:
            entry.joinedAt,

          previousValue:
            "",

          newValue:
            entry.role ||
            "Membre",

          sourceType:
            "Group",

          sourceId:
            group._id,

          dedupeKey:
            `migration:group:joined:${group._id}:${member._id}`,

          metadata: {
            groupId:
              group._id,

            groupName:
              group.name,

            groupType:
              group.type ||
              null,

            role:
              entry.role ||
              "Membre",

            note:
              entry.note ||
              "",

            membershipActive:
              entry.isActive !==
              false,

            groupStatus:
              group.status ||
              null,
          },
        });
      }
    }
  };

// ======================================================
// 4. DÉPARTEMENTS / RESPONSABILITÉS
// ======================================================

const backfillDepartments =
  async ({
    churchId,
    stats,
    dryRun,
  }) => {
    const departments =
      await Department.find({
        church: churchId,
      }).lean();

    stats.sources.departments =
      departments.length;

    for (
      const department of departments
    ) {
      const members =
        Array.isArray(
          department.members
        )
          ? department.members
          : [];

      for (
        const entry of members
      ) {
        if (!entry?.member) {
          continue;
        }

        const member =
          await Member.findOne({
            _id: entry.member,
            church: churchId,
          })
            .select(
              "_id firstName lastName"
            )
            .lean();

        if (!member) {
          stats.skipped += 1;
          continue;
        }

        const memberName =
          buildMemberName(
            member
          );

        // ================================================
        // ENTRÉE DANS LE DÉPARTEMENT
        // ================================================

        if (entry.joinedAt) {
          await ensureHistoryEvent({
            stats,
            dryRun,

            churchId,
            memberId:
              member._id,

            type:
              "DEPARTMENT_JOINED",

            category:
              "Département",

            title:
              `Entrée dans le département ${department.name}`,

            description:
              `${memberName} a rejoint le département « ${department.name} ».`,

            occurredAt:
              entry.joinedAt,

            previousValue:
              "",

            newValue:
              entry.role ||
              "Membre",

            sourceType:
              "Department",

            sourceId:
              department._id,

            dedupeKey:
              `migration:department:joined:${department._id}:${member._id}`,

            metadata: {
              departmentId:
                department._id,

              departmentName:
                department.name,

              role:
                entry.role ||
                "Membre",

              responsibility:
                entry.responsibility ||
                "",

              note:
                entry.note ||
                "",

              membershipActive:
                entry.isActive !==
                false,
            },
          });
        }

        // ================================================
        // SORTIE DU DÉPARTEMENT
        // ================================================

        if (entry.leftAt) {
          await ensureHistoryEvent({
            stats,
            dryRun,

            churchId,
            memberId:
              member._id,

            type:
              "DEPARTMENT_LEFT",

            category:
              "Département",

            title:
              `Sortie du département ${department.name}`,

            description:
              `${memberName} a quitté le département « ${department.name} ».`,

            occurredAt:
              entry.leftAt,

            previousValue:
              entry.role ||
              "Membre",

            newValue:
              "",

            sourceType:
              "Department",

            sourceId:
              department._id,

            dedupeKey:
              `migration:department:left:${department._id}:${member._id}`,

            metadata: {
              departmentId:
                department._id,

              departmentName:
                department.name,

              role:
                entry.role ||
                "Membre",

              responsibility:
                entry.responsibility ||
                "",

              joinedAt:
                entry.joinedAt ||
                null,

              leftAt:
                entry.leftAt,
            },
          });
        }
      }
    }
  };

// ======================================================
// 5. PRÉSENCES
// ======================================================

const backfillAttendances =
  async ({
    churchId,
    stats,
    dryRun,
  }) => {
    const attendances =
      await Attendance.find({
        church: churchId,
      })
        .populate(
          "event",
          "_id title type date location"
        )
        .populate(
          "member",
          "_id firstName lastName membershipType wasVisitor"
        )
        .lean();

    stats.sources.attendances =
      attendances.length;

    for (
      const attendance of
        attendances
    ) {
      const member =
        attendance.member;

      const event =
        attendance.event;

      if (
        !member ||
        !event
      ) {
        stats.skipped += 1;
        continue;
      }

      const memberName =
        buildMemberName(
          member
        );

      const eventDate =
        normalizeDate(
          event.date
        ) ||
        normalizeDate(
          attendance.markedAt
        ) ||
        normalizeDate(
          attendance.createdAt
        );

      if (!eventDate) {
        stats.skipped += 1;
        continue;
      }

      const actor =
        await getUserIdentity(
          attendance.markedBy
        );

      // ==================================================
      // PRÉSENCE RÉELLE
      // ==================================================

      if (
        attendance.status ===
          "Présent" ||
        attendance.status ===
          "En retard"
      ) {
        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId:
            member._id,

          type:
            "ATTENDANCE_RECORDED",

          category:
            "Présence",

          title:
            `Présence enregistrée — ${attendance.status}`,

          description:
            `${memberName} a été marqué « ${attendance.status} » pour l'événement « ${event.title} ».`,

          occurredAt:
            eventDate,

          previousValue:
            "",

          newValue:
            attendance.status,

          sourceType:
            "Attendance",

          sourceId:
            attendance._id,

          dedupeKey:
            `attendance:${attendance._id}`,

          metadata: {
            attendanceId:
              attendance._id,

            eventId:
              event._id,

            eventTitle:
              event.title,

            eventType:
              event.type ||
              null,

            eventDate,

            eventLocation:
              event.location ||
              "",

            status:
              attendance.status,

            note:
              attendance.note ||
              "",

            markedAt:
              attendance.markedAt ||
              null,

            ageAtEvent:
              attendance.ageAtEvent ??
              null,

            ageGroupSnapshot:
              attendance.ageGroupSnapshot ||
              null,

            genderSnapshot:
              attendance.genderSnapshot ||
              null,

            membershipTypeSnapshot:
              attendance.membershipTypeSnapshot ||
              null,
          },

          ...actor,
        });
      }

      // ==================================================
      // PREMIÈRE VISITE
      // ==================================================

      if (
        attendance.isFirstVisit ===
          true &&
        (
          attendance.status ===
            "Présent" ||
          attendance.status ===
            "En retard"
        )
      ) {
        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId:
            member._id,

          type:
            "FIRST_VISIT",

          category:
            "Visiteur",

          title:
            "Première visite",

          description:
            `${memberName} a effectué sa première visite lors de « ${event.title} ».`,

          occurredAt:
            eventDate,

          previousValue:
            "",

          newValue:
            "Première visite",

          sourceType:
            "Attendance",

          sourceId:
            attendance._id,

          /*
           * IMPORTANT :
           *
           * Même clé que le contrôleur Attendance actuel.
           * Le backfill et les écritures futures partagent
           * ainsi la même identité logique.
           */
          dedupeKey:
            `first-visit:${member._id}`,

          metadata: {
            attendanceId:
              attendance._id,

            eventId:
              event._id,

            eventTitle:
              event.title,

            eventDate,

            attendanceStatus:
              attendance.status,

            membershipTypeSnapshot:
              attendance.membershipTypeSnapshot ||
              null,

            wasVisitor:
              member.wasVisitor ===
              true,
          },

          ...actor,
        });
      }
    }
  };

// ======================================================
// 6. ALERTES PASTORALES
// ======================================================

const backfillPastoralAlerts =
  async ({
    churchId,
    stats,
    dryRun,
  }) => {
    const alerts =
      await PastoralAlert.find({
        church: churchId,
      })
        .populate(
          "member",
          "_id firstName lastName"
        )
        .lean();

    stats.sources.pastoralAlerts =
      alerts.length;

    for (
      const alert of alerts
    ) {
      const member =
        alert.member;

      if (!member) {
        stats.skipped += 1;
        continue;
      }

      const memberName =
        buildMemberName(
          member
        );

      /*
       * createdAt est volontairement privilégié.
       *
       * detectedAt peut être modifié lorsqu'une ancienne
       * alerte résolue est réouverte.
       *
       * createdAt représente donc mieux la création
       * historique du document d'alerte.
       */
      const creationDate =
        normalizeDate(
          alert.createdAt
        ) ||
        normalizeDate(
          alert.detectedAt
        );

      // ==================================================
      // ALERTE CRÉÉE
      // ==================================================

      if (creationDate) {
        await ensureHistoryEvent({
          stats,
          dryRun,

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
            `Une alerte « ${alert.type} » de niveau « ${alert.level} » a été détectée pour ${memberName}.`,

          occurredAt:
            creationDate,

          previousValue:
            "",

          newValue:
            alert.level,

          sourceType:
            "PastoralAlert",

          sourceId:
            alert._id,

          dedupeKey:
            `migration:pastoral-alert:created:${alert._id}`,

          metadata: {
            alertId:
              alert._id,

            alertType:
              alert.type,

            level:
              alert.level,

            status:
              alert.status,

            consecutiveMissedServices:
              alert.consecutiveMissedServices,

            lastPresenceDate:
              alert.lastPresenceDate ||
              null,

            lastCheckedServiceDate:
              alert.lastCheckedServiceDate ||
              null,

            daysSinceLastPresence:
              alert.daysSinceLastPresence ??
              null,

            detectedAt:
              alert.detectedAt ||
              null,

            lastDetectedAt:
              alert.lastDetectedAt ||
              null,

            legacyAlert:
              true,
          },
        });
      }

      // ==================================================
      // CONTACT PASTORAL HISTORIQUE
      // ==================================================

      if (alert.contactedAt) {
        const assignedActor =
          await getUserIdentity(
            alert.assignedTo
          );

        await ensureHistoryEvent({
          stats,
          dryRun,

          churchId,
          memberId:
            member._id,

          type:
            "PASTORAL_ALERT_UPDATED",

          category:
            "Suivi pastoral",

          title:
            "Contact pastoral",

          description:
            `${memberName} a été contacté dans le cadre de son suivi pastoral.`,

          occurredAt:
            alert.contactedAt,

          previousValue:
            "Ouverte",

          newValue:
            alert.status ===
            "Résolue"
              ? "En cours"
              : alert.status,

          sourceType:
            "PastoralAlert",

          sourceId:
            alert._id,

          dedupeKey:
            `migration:pastoral-alert:contacted:${alert._id}:${new Date(
              alert.contactedAt
            ).getTime()}`,

          metadata: {
            alertId:
              alert._id,

            alertType:
              alert.type,

            contactedAt:
              alert.contactedAt,

            assignedTo:
              alert.assignedTo ||
              null,

            note:
              alert.note ||
              "",

            legacyContact:
              true,
          },

          ...assignedActor,
        });
      }

      // ==================================================
      // ALERTE RÉSOLUE
      // ==================================================

      if (
        alert.status ===
          "Résolue" &&
        alert.resolvedAt
      ) {
        const resolver =
          await getUserIdentity(
            alert.resolvedBy
          );

        await ensureHistoryEvent({
          stats,
          dryRun,

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
            `L'alerte pastorale de ${memberName} a été résolue.`,

          occurredAt:
            alert.resolvedAt,

          previousValue:
            "En cours",

          newValue:
            "Résolue",

          sourceType:
            "PastoralAlert",

          sourceId:
            alert._id,

          dedupeKey:
            `migration:pastoral-alert:resolved:${alert._id}:${new Date(
              alert.resolvedAt
            ).getTime()}`,

          metadata: {
            alertId:
              alert._id,

            alertType:
              alert.type,

            level:
              alert.level,

            resolvedAt:
              alert.resolvedAt,

            resolvedBy:
              alert.resolvedBy ||
              null,

            note:
              alert.note ||
              "",

            legacyResolution:
              true,
          },

          ...resolver,
        });
      }
    }
  };

// ======================================================
// SERVICE PRINCIPAL
// ======================================================

const runPersonHistoryBackfill =
  async ({
    churchId,
    dryRun = false,
  } = {}) => {
    // ==================================================
    // VALIDATION DU TENANT
    // ==================================================

    if (!churchId) {
      throw new Error(
        "churchId est obligatoire pour lancer le backfill PersonHistory."
      );
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        churchId
      )
    ) {
      throw new Error(
        "churchId invalide."
      );
    }

    const normalizedChurchId =
      new mongoose.Types.ObjectId(
        churchId
      );

    const stats =
      createStats();

    const startedAt =
      new Date();

    console.log(
      `\n🕓 Backfill PersonHistory démarré pour l'église ${normalizedChurchId}`
    );

    console.log(
      dryRun
        ? "🔎 Mode DRY RUN : aucune écriture MongoDB."
        : "💾 Mode réel : les événements manquants seront créés."
    );

    // ==================================================
    // ORDRE DU BACKFILL
    // ==================================================

    await backfillMembers({
      churchId:
        normalizedChurchId,
      stats,
      dryRun,
    });

    await backfillFamilies({
      churchId:
        normalizedChurchId,
      stats,
      dryRun,
    });

    await backfillGroups({
      churchId:
        normalizedChurchId,
      stats,
      dryRun,
    });

    await backfillDepartments({
      churchId:
        normalizedChurchId,
      stats,
      dryRun,
    });

    await backfillAttendances({
      churchId:
        normalizedChurchId,
      stats,
      dryRun,
    });

    await backfillPastoralAlerts({
      churchId:
        normalizedChurchId,
      stats,
      dryRun,
    });

    const finishedAt =
      new Date();

    const durationMs =
      finishedAt.getTime() -
      startedAt.getTime();

    const result = {
      success: true,

      dryRun,

      backfillVersion:
        BACKFILL_VERSION,

      churchId:
        normalizedChurchId.toString(),

      startedAt,
      finishedAt,
      durationMs,

      stats,
    };

    console.log(
      "\n✅ Backfill PersonHistory terminé."
    );

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  runPersonHistoryBackfill,
  BACKFILL_VERSION,
};