const mongoose = require("mongoose");

const Member = require("../models/Member");
const User = require("../models/User");
const createActivityLog = require("../utils/createActivityLog");

// ======================================================
// CONSTANTES
// ======================================================

const FOLLOW_UP_STATUSES = [
  "Non commencé",
  "À contacter",
  "Contacté",
  "En suivi",
  "Intégré",
  "Clôturé",
];

// ======================================================
// LOG NON BLOQUANT
// ======================================================

const safeCreateActivityLog = async (payload) => {
  try {
    await createActivityLog(payload);
  } catch (error) {
    console.error(
      "Erreur ActivityLog VisitorFollowUp :",
      error.message
    );
  }
};

// ======================================================
// LISTE DES VISITEURS À SUIVRE
// GET /api/visitor-follow-up
// ======================================================

const getVisitorsFollowUp = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        parseInt(req.query.limit, 10) || 20,
        1
      ),
      1000
    );

    const skip = (page - 1) * limit;

    const filter = {
      church: req.churchId,
      membershipType: "Visiteur",
    };

    // ==================================================
    // RECHERCHE
    // ==================================================

    if (req.query.search) {
      const search = String(
        req.query.search
      ).trim();

      if (search) {
        filter.$or = [
          {
            firstName: {
              $regex: search,
              $options: "i",
            },
          },
          {
            lastName: {
              $regex: search,
              $options: "i",
            },
          },
          {
            phone: {
              $regex: search,
              $options: "i",
            },
          },
          {
            email: {
              $regex: search,
              $options: "i",
            },
          },
        ];
      }
    }

    // ==================================================
    // STATUT DU SUIVI
    // ==================================================

    if (
      req.query.followUpStatus &&
      FOLLOW_UP_STATUSES.includes(
        req.query.followUpStatus
      )
    ) {
      filter.followUpStatus =
        req.query.followUpStatus;
    }

    // ==================================================
    // RESPONSABLE
    // ==================================================

    if (
      req.query.assignedTo &&
      mongoose.Types.ObjectId.isValid(
        req.query.assignedTo
      )
    ) {
      filter.followUpAssignedTo =
        req.query.assignedTo;
    }

    // ==================================================
    // RELANCES EN RETARD
    // ==================================================

    if (req.query.overdue === "true") {
      filter.nextFollowUpDate = {
        $lt: new Date(),
      };

      filter.followUpStatus = {
        $nin: [
          "Intégré",
          "Clôturé",
        ],
      };
    }

    // ==================================================
    // REQUÊTE
    // ==================================================

    const [total, visitors] =
      await Promise.all([
        Member.countDocuments(filter),

        Member.find(filter)
          .populate(
            "followUpAssignedTo",
            "name email role"
          )
          .populate(
            "department",
            "name"
          )
          .sort({
            nextFollowUpDate: 1,
            firstVisitDate: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit),
      ]);

    return res.status(200).json({
      success: true,

      page,
      limit,
      total,

      totalPages:
        Math.ceil(total / limit),

      count:
        visitors.length,

      data: visitors,
    });
  } catch (error) {
    console.error(
      "Erreur getVisitorsFollowUp :",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Impossible de récupérer le suivi des visiteurs",
    });
  }
};

// ======================================================
// STATISTIQUES DU SUIVI
// GET /api/visitor-follow-up/stats
// ======================================================

const getVisitorFollowUpStats = async (
  req,
  res
) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const church =
      req.churchId;

    const now =
      new Date();

    const thirtyDaysAgo =
      new Date(
        now.getTime() -
          30 *
            24 *
            60 *
            60 *
            1000
      );

    const [
      totalVisitors,
      toContact,
      contacted,
      inFollowUp,
      integrated,
      closed,
      overdue,
      upcomingFollowUps,
      recentVisitors,
    ] = await Promise.all([
      // ----------------------------------------------
      // Visiteurs actuellement non intégrés
      // ----------------------------------------------

      Member.countDocuments({
        church,
        membershipType:
          "Visiteur",
      }),

      // ----------------------------------------------
      // À contacter
      // ----------------------------------------------

      Member.countDocuments({
        church,
        membershipType:
          "Visiteur",

        followUpStatus:
          "À contacter",
      }),

      // ----------------------------------------------
      // Contactés
      // ----------------------------------------------

      Member.countDocuments({
        church,
        membershipType:
          "Visiteur",

        followUpStatus:
          "Contacté",
      }),

      // ----------------------------------------------
      // En suivi
      // ----------------------------------------------

      Member.countDocuments({
        church,
        membershipType:
          "Visiteur",

        followUpStatus:
          "En suivi",
      }),

      // ----------------------------------------------
      // ANCIENS VISITEURS DEVENUS MEMBRES
      //
      // Important :
      // on ne compte PAS les membres créés
      // directement comme membres.
      // ----------------------------------------------

      Member.countDocuments({
        church,

        membershipType:
          "Membre",

        wasVisitor: true,

        integratedAt: {
          $ne: null,
        },

        followUpStatus:
          "Intégré",
      }),

      // ----------------------------------------------
      // Suivis clôturés
      // ----------------------------------------------

      Member.countDocuments({
        church,
        membershipType:
          "Visiteur",

        followUpStatus:
          "Clôturé",
      }),

      // ----------------------------------------------
      // Relances en retard
      // ----------------------------------------------

      Member.countDocuments({
        church,

        membershipType:
          "Visiteur",

        nextFollowUpDate: {
          $lt: now,
        },

        followUpStatus: {
          $nin: [
            "Intégré",
            "Clôturé",
          ],
        },
      }),

      // ----------------------------------------------
      // Relances à venir
      // ----------------------------------------------

      Member.countDocuments({
        church,

        membershipType:
          "Visiteur",

        nextFollowUpDate: {
          $gte: now,
        },

        followUpStatus: {
          $nin: [
            "Intégré",
            "Clôturé",
          ],
        },
      }),

      // ----------------------------------------------
      // Nouveaux visiteurs des 30 derniers jours
      // ----------------------------------------------

      Member.countDocuments({
        church,

        membershipType:
          "Visiteur",

        firstVisitDate: {
          $gte:
            thirtyDaysAgo,
        },
      }),
    ]);

    // ==================================================
    // TAUX D'INTÉGRATION
    //
    // Population historique connue :
    // visiteurs actuels + anciens visiteurs intégrés.
    // ==================================================

    const totalVisitorJourney =
      totalVisitors +
      integrated;

    const conversionRate =
      totalVisitorJourney > 0
        ? Number(
            (
              (integrated /
                totalVisitorJourney) *
              100
            ).toFixed(1)
          )
        : 0;

    return res.status(200).json({
      success: true,

      data: {
        totalVisitors,
        toContact,
        contacted,
        inFollowUp,
        integrated,
        closed,
        overdue,
        upcomingFollowUps,
        recentVisitors,
        conversionRate,
      },
    });
  } catch (error) {
    console.error(
      "Erreur getVisitorFollowUpStats :",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Impossible de récupérer les statistiques de suivi",
    });
  }
};

// ======================================================
// DÉTAIL D'UN VISITEUR
// GET /api/visitor-follow-up/:id
// ======================================================

const getVisitorFollowUpById = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Identifiant du visiteur invalide",
      });
    }

    const visitor =
      await Member.findOne({
        _id: id,

        church:
          req.churchId,

        membershipType:
          "Visiteur",
      })
        .populate(
          "followUpAssignedTo",
          "name email role"
        )
        .populate(
          "department",
          "name"
        );

    if (!visitor) {
      return res.status(404).json({
        success: false,

        message:
          "Visiteur introuvable",
      });
    }

    return res.status(200).json({
      success: true,

      data: visitor,
    });
  } catch (error) {
    console.error(
      "Erreur getVisitorFollowUpById :",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Impossible de récupérer le visiteur",
    });
  }
};

// ======================================================
// MODIFIER LE SUIVI
// PUT /api/visitor-follow-up/:id
// ======================================================

const updateVisitorFollowUp = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Identifiant du visiteur invalide",
      });
    }

    const visitor =
      await Member.findOne({
        _id: id,

        church:
          req.churchId,

        membershipType:
          "Visiteur",
      });

    if (!visitor) {
      return res.status(404).json({
        success: false,

        message:
          "Visiteur introuvable",
      });
    }

    const {
      followUpStatus,
      followUpAssignedTo,
      followUpNote,
      lastContactDate,
      nextFollowUpDate,
    } = req.body;

    // ==================================================
    // STATUT
    // ==================================================

    if (
      typeof followUpStatus !==
      "undefined"
    ) {
      if (
        !FOLLOW_UP_STATUSES.includes(
          followUpStatus
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Statut de suivi invalide",
        });
      }

      /*
       * L'intégration doit passer par
       * /:id/integrate afin de conserver
       * correctement l'historique.
       */
      if (
        followUpStatus ===
        "Intégré"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Utilisez l'action d'intégration pour transformer ce visiteur en membre",
        });
      }

      visitor.followUpStatus =
        followUpStatus;
    }

    // ==================================================
    // RESPONSABLE
    // ==================================================

    if (
      typeof followUpAssignedTo !==
      "undefined"
    ) {
      if (!followUpAssignedTo) {
        visitor.followUpAssignedTo =
          null;
      } else {
        if (
          !mongoose.Types.ObjectId.isValid(
            followUpAssignedTo
          )
        ) {
          return res.status(400).json({
            success: false,

            message:
              "Responsable de suivi invalide",
          });
        }

        const assignedUser =
          await User.findOne({
            _id:
              followUpAssignedTo,

            $or: [
              {
                church:
                  req.churchId,
              },

              {
                churchMemberships: {
                  $elemMatch: {
                    church:
                      req.churchId,
                  },
                },
              },
            ],

            isActive: true,
          });

        if (!assignedUser) {
          return res.status(400).json({
            success: false,

            message:
              "Le responsable sélectionné n'appartient pas à cette église",
          });
        }

        visitor.followUpAssignedTo =
          assignedUser._id;
      }
    }

    // ==================================================
    // NOTE
    // ==================================================

    if (
      typeof followUpNote !==
      "undefined"
    ) {
      visitor.followUpNote =
        typeof followUpNote ===
        "string"
          ? followUpNote.trim()
          : "";
    }

    // ==================================================
    // DERNIER CONTACT
    // ==================================================

    if (
      typeof lastContactDate !==
      "undefined"
    ) {
      if (!lastContactDate) {
        visitor.lastContactDate =
          null;
      } else {
        const date =
          new Date(
            lastContactDate
          );

        if (
          Number.isNaN(
            date.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,

            message:
              "Date du dernier contact invalide",
          });
        }

        visitor.lastContactDate =
          date;
      }
    }

    // ==================================================
    // PROCHAINE RELANCE
    // ==================================================

    if (
      typeof nextFollowUpDate !==
      "undefined"
    ) {
      if (!nextFollowUpDate) {
        visitor.nextFollowUpDate =
          null;
      } else {
        const date =
          new Date(
            nextFollowUpDate
          );

        if (
          Number.isNaN(
            date.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,

            message:
              "Date de prochaine relance invalide",
          });
        }

        visitor.nextFollowUpDate =
          date;
      }
    }

    // ==================================================
    // SAUVEGARDE
    // ==================================================

    await visitor.save();

    const updatedVisitor =
      await Member.findOne({
        _id:
          visitor._id,

        church:
          req.churchId,
      })
        .populate(
          "followUpAssignedTo",
          "name email role"
        )
        .populate(
          "department",
          "name"
        );

    await safeCreateActivityLog({
      req,

      action:
        "UPDATE",

      entity:
        "Member",

      entityId:
        visitor._id,

      description:
        `Suivi mis à jour : ${visitor.firstName} ${visitor.lastName}`,
    });

    return res.status(200).json({
      success: true,

      message:
        "Suivi mis à jour avec succès",

      data:
        updatedVisitor,
    });
  } catch (error) {
    console.error(
      "Erreur updateVisitorFollowUp :",
      error
    );

    if (
      error.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Impossible de modifier le suivi",
    });
  }
};

// ======================================================
// MARQUER COMME CONTACTÉ
// PATCH /api/visitor-follow-up/:id/contact
// ======================================================

const markVisitorAsContacted = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Identifiant du visiteur invalide",
      });
    }

    const visitor =
      await Member.findOne({
        _id: id,

        church:
          req.churchId,

        membershipType:
          "Visiteur",
      });

    if (!visitor) {
      return res.status(404).json({
        success: false,

        message:
          "Visiteur introuvable",
      });
    }

    visitor.followUpStatus =
      "Contacté";

    visitor.lastContactDate =
      new Date();

    if (
      req.body &&
      typeof req.body.note ===
        "string" &&
      req.body.note.trim()
    ) {
      visitor.followUpNote =
        req.body.note.trim();
    }

    await visitor.save();

    const updatedVisitor =
      await Member.findOne({
        _id:
          visitor._id,

        church:
          req.churchId,
      })
        .populate(
          "followUpAssignedTo",
          "name email role"
        )
        .populate(
          "department",
          "name"
        );

    await safeCreateActivityLog({
      req,

      action:
        "UPDATE",

      entity:
        "Member",

      entityId:
        visitor._id,

      description:
        `Visiteur contacté : ${visitor.firstName} ${visitor.lastName}`,
    });

    return res.status(200).json({
      success: true,

      message:
        "Visiteur marqué comme contacté",

      data:
        updatedVisitor,
    });
  } catch (error) {
    console.error(
      "Erreur markVisitorAsContacted :",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Impossible d'enregistrer le contact",
    });
  }
};

// ======================================================
// INTÉGRER LE VISITEUR COMME MEMBRE
// PATCH /api/visitor-follow-up/:id/integrate
// ======================================================

const integrateVisitor = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Identifiant du visiteur invalide",
      });
    }

    const visitor =
      await Member.findOne({
        _id: id,

        church:
          req.churchId,

        membershipType:
          "Visiteur",
      });

    if (!visitor) {
      return res.status(404).json({
        success: false,

        message:
          "Visiteur introuvable",
      });
    }

    const integrationDate =
      new Date();

    // ==================================================
    // CONSERVATION DE L'HISTORIQUE
    // ==================================================

    visitor.wasVisitor =
      true;

    visitor.integratedAt =
      integrationDate;

    // ==================================================
    // TRANSFORMATION EN MEMBRE
    // ==================================================

    visitor.membershipType =
      "Membre";

    visitor.membershipDate =
      integrationDate;

    visitor.followUpStatus =
      "Intégré";

    visitor.nextFollowUpDate =
      null;

    await visitor.save();

    const integratedMember =
      await Member.findOne({
        _id:
          visitor._id,

        church:
          req.churchId,
      })
        .populate(
          "followUpAssignedTo",
          "name email role"
        )
        .populate(
          "department",
          "name"
        );

    await safeCreateActivityLog({
      req,

      action:
        "UPDATE",

      entity:
        "Member",

      entityId:
        visitor._id,

      description:
        `Visiteur intégré comme membre : ${visitor.firstName} ${visitor.lastName}`,
    });

    return res.status(200).json({
      success: true,

      message:
        `${visitor.firstName} ${visitor.lastName} est maintenant membre`,

      data:
        integratedMember,
    });
  } catch (error) {
    console.error(
      "Erreur integrateVisitor :",
      error
    );

    if (
      error.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Impossible d'intégrer le visiteur",
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getVisitorsFollowUp,
  getVisitorFollowUpStats,
  getVisitorFollowUpById,
  updateVisitorFollowUp,
  markVisitorAsContacted,
  integrateVisitor,
};