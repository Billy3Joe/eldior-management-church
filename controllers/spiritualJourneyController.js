const mongoose = require("mongoose");

const Member = require("../models/Member");
const createPersonHistory = require("../utils/createPersonHistory");

// ======================================================
// ÉTAPES OFFICIELLES
// ======================================================

const SPIRITUAL_STAGES = [
  "Visiteur",
  "Nouveau",
  "Suivi",
  "Intégration",
  "Membre",
  "Baptisé",
  "Formation",
  "Serviteur",
  "Responsable",
];

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(value);
};

const getDefaultStage = (member) => {
  if (member?.membershipType === "Visiteur") {
    return "Visiteur";
  }

  return "Membre";
};

// ======================================================
// POPULATE COMMUN
// ======================================================

const populateJourney = async (member) => {
  if (!member) {
    return member;
  }

  await member.populate([
    {
      path: "spiritualMentor",
      select: "name email role",
    },

    {
      path: "spiritualJourneyHistory.changedBy",
      select: "name email role",
    },

    {
      path: "followUpAssignedTo",
      select: "name email role",
    },

    {
      path: "department",
      select: "name",
    },

    {
      path: "family",
      select: "name phone address",
    },
  ]);

  return member;
};

// ======================================================
// INITIALISATION DES ANCIENS MEMBRES
// ======================================================

const ensureJourneyInitialized = async (member) => {
  if (!member) {
    return null;
  }

  let changed = false;

  // ==================================================
  // ÉTAPE ACTUELLE
  // ==================================================

  if (!member.spiritualStage) {
    member.spiritualStage = getDefaultStage(member);

    changed = true;
  }

  // ==================================================
  // DATE DE DÉBUT
  // ==================================================

  if (!member.spiritualStageSince) {
    member.spiritualStageSince =
      member.membershipDate ||
      member.firstVisitDate ||
      member.createdAt ||
      new Date();

    changed = true;
  }

  // ==================================================
  // HISTORIQUE INITIAL
  // ==================================================

  if (
    !Array.isArray(member.spiritualJourneyHistory) ||
    member.spiritualJourneyHistory.length === 0
  ) {
    member.spiritualJourneyHistory = [
      {
        stage: member.spiritualStage,

        enteredAt: member.spiritualStageSince,

        exitedAt: null,

        note: "Étape initiale du parcours.",

        changedBy: null,
      },
    ];

    changed = true;
  }

  if (changed) {
    await member.save();
  }

  return member;
};

// ======================================================
// GET /api/spiritual-journey/stages
// LISTE DES ÉTAPES
// ======================================================

exports.getStages = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: SPIRITUAL_STAGES,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET /api/spiritual-journey/member/:memberId
// PARCOURS COMPLET D'UNE PERSONNE
// ======================================================

exports.getMemberJourney = async (req, res, next) => {
  try {
    const { memberId } = req.params;

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Identifiant de personne invalide.",
      });
    }

    let member = await Member.findOne({
      _id: memberId,
      church: req.churchId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Personne introuvable.",
      });
    }

    member = await ensureJourneyInitialized(member);

    await populateJourney(member);

    return res.status(200).json({
      success: true,

      data: {
        member: {
          _id: member._id,
          firstName: member.firstName,
          lastName: member.lastName,
          gender: member.gender,
          birthDate: member.birthDate,
          ageGroup: member.ageGroup,
          membershipType: member.membershipType,
          status: member.status,
        },

        currentStage: member.spiritualStage,

        stageSince: member.spiritualStageSince,

        mentor: member.spiritualMentor || null,

        note: member.spiritualJourneyNote || "",

        nextFollowUpDate:
          member.nextSpiritualFollowUpDate || null,

        history: member.spiritualJourneyHistory || [],

        availableStages: SPIRITUAL_STAGES,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET /api/spiritual-journey/member/:memberId/history
// HISTORIQUE UNIQUEMENT
// ======================================================

exports.getMemberJourneyHistory = async (
  req,
  res,
  next
) => {
  try {
    const { memberId } = req.params;

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Identifiant de personne invalide.",
      });
    }

    let member = await Member.findOne({
      _id: memberId,
      church: req.churchId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Personne introuvable.",
      });
    }

    member = await ensureJourneyInitialized(member);

    await member.populate({
      path: "spiritualJourneyHistory.changedBy",
      select: "name email role",
    });

    const history = [
      ...(member.spiritualJourneyHistory || []),
    ].sort(
      (a, b) =>
        new Date(a.enteredAt) -
        new Date(b.enteredAt)
    );

    return res.status(200).json({
      success: true,

      data: {
        memberId: member._id,

        currentStage: member.spiritualStage,

        stageSince: member.spiritualStageSince,

        history,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// PUT /api/spiritual-journey/member/:memberId/stage
// CHANGER L'ÉTAPE D'UNE PERSONNE
// ======================================================

exports.changeMemberStage = async (
  req,
  res,
  next
) => {
  try {
    const { memberId } = req.params;

    const {
      stage,
      note = "",
    } = req.body;

    // ==================================================
    // VALIDATION ID
    // ==================================================

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Identifiant de personne invalide.",
      });
    }

    // ==================================================
    // VALIDATION ÉTAPE
    // ==================================================

    if (!stage) {
      return res.status(400).json({
        success: false,
        message: "La nouvelle étape est obligatoire.",
      });
    }

    if (!SPIRITUAL_STAGES.includes(stage)) {
      return res.status(400).json({
        success: false,

        message:
          "Étape du parcours spirituel invalide.",

        availableStages: SPIRITUAL_STAGES,
      });
    }

    // ==================================================
    // PERSONNE
    // ==================================================

    let member = await Member.findOne({
      _id: memberId,
      church: req.churchId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Personne introuvable.",
      });
    }

    member = await ensureJourneyInitialized(member);

    // ==================================================
    // MÊME ÉTAPE
    // ==================================================

    if (member.spiritualStage === stage) {
      return res.status(400).json({
        success: false,

        message:
          `${member.firstName} ${member.lastName} est déjà à l'étape « ${stage} ».`,
      });
    }

    const now = new Date();

    const previousStage = member.spiritualStage;

    const normalizedNote =
      typeof note === "string"
        ? note.trim()
        : "";

    // ==================================================
    // FERMER L'ÉTAPE ACTUELLE
    // ==================================================

    const history =
      member.spiritualJourneyHistory || [];

    let currentHistoryEntry = null;

    for (
      let index = history.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (
        history[index].exitedAt === null ||
        !history[index].exitedAt
      ) {
        currentHistoryEntry = history[index];

        break;
      }
    }

    if (currentHistoryEntry) {
      currentHistoryEntry.exitedAt = now;
    } else {
      history.push({
        stage: previousStage,

        enteredAt:
          member.spiritualStageSince ||
          member.createdAt ||
          now,

        exitedAt: now,

        note:
          "Étape reconstruite automatiquement.",

        changedBy: null,
      });
    }

    // ==================================================
    // AJOUTER NOUVELLE ÉTAPE
    // ==================================================

    history.push({
      stage,

      enteredAt: now,

      exitedAt: null,

      note: normalizedNote,

      changedBy: req.user?._id || null,
    });

    member.spiritualJourneyHistory = history;

    member.spiritualStage = stage;

    member.spiritualStageSince = now;

    await member.save();

    // ==================================================
    // HISTORIQUE GLOBAL DE LA PERSONNE
    // ==================================================

    const fullName = [
      member.firstName,
      member.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    await createPersonHistory({
      req,

      churchId: req.churchId,

      memberId: member._id,

      type: "SPIRITUAL_STAGE_CHANGED",

      category: "Parcours spirituel",

      title:
        `Étape spirituelle : ${previousStage} → ${stage}`,

      description:
        `${fullName || "Cette personne"} est passée de l'étape « ${previousStage} » à l'étape « ${stage} ».`,

      occurredAt: now,

      previousValue: previousStage,

      newValue: stage,

      sourceType: "SpiritualJourney",

      sourceId: member._id,

      metadata: {
        previousStage,
        newStage: stage,
        note: normalizedNote,
        previousStageSince:
          currentHistoryEntry?.enteredAt ||
          member.createdAt ||
          null,
        newStageSince: now,
      },

      origin: "automatic",

      visibility: "standard",
    });

    await populateJourney(member);

    return res.status(200).json({
      success: true,

      message:
        `Parcours mis à jour : ${previousStage} → ${stage}.`,

      data: {
        member: {
          _id: member._id,
          firstName: member.firstName,
          lastName: member.lastName,
        },

        previousStage,

        currentStage: member.spiritualStage,

        stageSince: member.spiritualStageSince,

        history: member.spiritualJourneyHistory,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// PUT /api/spiritual-journey/member/:memberId/support
// ACCOMPAGNEMENT SPIRITUEL
// ======================================================

exports.updateMemberSupport = async (
  req,
  res,
  next
) => {
  try {
    const { memberId } = req.params;

    const {
      spiritualMentor,
      spiritualJourneyNote,
      nextSpiritualFollowUpDate,
    } = req.body;

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Identifiant de personne invalide.",
      });
    }

    let member = await Member.findOne({
      _id: memberId,
      church: req.churchId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Personne introuvable.",
      });
    }

    member = await ensureJourneyInitialized(member);

    // ==================================================
    // MENTOR
    // ==================================================

    if (spiritualMentor !== undefined) {
      if (
        spiritualMentor === null ||
        spiritualMentor === ""
      ) {
        member.spiritualMentor = null;
      } else {
        if (!isValidObjectId(spiritualMentor)) {
          return res.status(400).json({
            success: false,

            message:
              "Responsable d'accompagnement invalide.",
          });
        }

        member.spiritualMentor = spiritualMentor;
      }
    }

    // ==================================================
    // NOTE
    // ==================================================

    if (spiritualJourneyNote !== undefined) {
      member.spiritualJourneyNote =
        typeof spiritualJourneyNote === "string"
          ? spiritualJourneyNote.trim()
          : "";
    }

    // ==================================================
    // PROCHAINE RELANCE
    // ==================================================

    if (
      nextSpiritualFollowUpDate !== undefined
    ) {
      if (
        nextSpiritualFollowUpDate === null ||
        nextSpiritualFollowUpDate === ""
      ) {
        member.nextSpiritualFollowUpDate = null;
      } else {
        const date = new Date(
          nextSpiritualFollowUpDate
        );

        if (Number.isNaN(date.getTime())) {
          return res.status(400).json({
            success: false,

            message:
              "Date de prochain suivi invalide.",
          });
        }

        member.nextSpiritualFollowUpDate = date;
      }
    }

    await member.save();

    await populateJourney(member);

    return res.status(200).json({
      success: true,

      message:
        "Accompagnement spirituel mis à jour.",

      data: {
        spiritualStage: member.spiritualStage,

        spiritualStageSince:
          member.spiritualStageSince,

        spiritualMentor:
          member.spiritualMentor,

        spiritualJourneyNote:
          member.spiritualJourneyNote,

        nextSpiritualFollowUpDate:
          member.nextSpiritualFollowUpDate,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET /api/spiritual-journey/stats
// STATISTIQUES DU PARCOURS
// ======================================================

exports.getJourneyStats = async (
  req,
  res,
  next
) => {
  try {
    const churchId =
      new mongoose.Types.ObjectId(
        req.churchId
      );

    // ==================================================
    // TOTAL
    // ==================================================

    const totalPeople =
      await Member.countDocuments({
        church: req.churchId,
      });

    // ==================================================
    // PAR ÉTAPE
    // ==================================================

    const grouped = await Member.aggregate([
      {
        $match: {
          church: churchId,
        },
      },

      {
        $group: {
          _id: {
            $ifNull: [
              "$spiritualStage",
              null,
            ],
          },

          count: {
            $sum: 1,
          },
        },
      },
    ]);

    const byStage = {};

    SPIRITUAL_STAGES.forEach((stage) => {
      byStage[stage] = 0;
    });

    let legacyWithoutStage = 0;

    grouped.forEach((item) => {
      if (
        item._id &&
        SPIRITUAL_STAGES.includes(item._id)
      ) {
        byStage[item._id] = item.count;
      } else {
        legacyWithoutStage += item.count;
      }
    });

    // ==================================================
    // ANCIENNES PERSONNES SANS CHAMP
    // ==================================================

    if (legacyWithoutStage > 0) {
      const legacyVisitors =
        await Member.countDocuments({
          church: req.churchId,

          spiritualStage: {
            $exists: false,
          },

          membershipType: "Visiteur",
        });

      const legacyMembers =
        legacyWithoutStage - legacyVisitors;

      byStage.Visiteur += legacyVisitors;

      byStage.Membre += legacyMembers;
    }

    // ==================================================
    // PERSONNES À SUIVRE
    // ==================================================

    const now = new Date();

    const followUpsDue =
      await Member.countDocuments({
        church: req.churchId,

        nextSpiritualFollowUpDate: {
          $ne: null,
          $lte: now,
        },
      });

    // ==================================================
    // PERSONNES SANS MENTOR
    // ==================================================

    const withoutMentor =
      await Member.countDocuments({
        church: req.churchId,

        spiritualMentor: null,
      });

    // ==================================================
    // STAGNATION 90 JOURS
    // ==================================================

    const ninetyDaysAgo = new Date();

    ninetyDaysAgo.setDate(
      ninetyDaysAgo.getDate() - 90
    );

    const stagnant90Days =
      await Member.countDocuments({
        church: req.churchId,

        spiritualStageSince: {
          $lte: ninetyDaysAgo,
        },

        spiritualStage: {
          $nin: ["Responsable"],
        },
      });

    return res.status(200).json({
      success: true,

      data: {
        totalPeople,
        byStage,
        followUpsDue,
        withoutMentor,
        stagnant90Days,
      },
    });
  } catch (error) {
    next(error);
  }
};