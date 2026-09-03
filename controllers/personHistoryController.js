const mongoose =
  require("mongoose");

const PersonHistory =
  require(
    "../models/PersonHistory"
  );

const Member =
  require(
    "../models/Member"
  );

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (
  value
) =>
  mongoose.Types.ObjectId.isValid(
    value
  );

// ======================================================
// HISTORIQUE COMPLET D'UNE PERSONNE
// GET /api/person-history/member/:memberId
// ======================================================

const getMemberHistory =
  async (req, res) => {
    try {
      const {
        memberId,
      } = req.params;

      const {
        category = "",
        type = "",
        page = 1,
        limit = 100,
      } = req.query;

      // ==================================================
      // ID VALIDE
      // ==================================================

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
              "Identifiant de la personne invalide.",
          });
      }

      // ==================================================
      // PERSONNE DANS LA MÊME ÉGLISE
      // ==================================================

      const member =
        await Member.findOne({
          _id:
            memberId,

          church:
            req.churchId,
        })
          .select(
            "firstName lastName membershipType status"
          )
          .lean();

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Personne introuvable dans cette église.",
          });
      }

      // ==================================================
      // PAGINATION
      // ==================================================

      const numericPage =
        Math.max(
          parseInt(
            page,
            10
          ) || 1,
          1
        );

      const numericLimit =
        Math.min(
          Math.max(
            parseInt(
              limit,
              10
            ) || 100,
            1
          ),
          500
        );

      const skip =
        (
          numericPage -
          1
        ) *
        numericLimit;

      // ==================================================
      // FILTRE
      // ==================================================

      const filter = {
        church:
          req.churchId,

        member:
          memberId,
      };

      if (category) {
        filter.category =
          category;
      }

      if (type) {
        filter.type =
          type;
      }

      // ==================================================
      // REQUÊTE
      // ==================================================

      const [
        history,
        total,
      ] =
        await Promise.all([
          PersonHistory.find(
            filter
          )
            .populate({
              path:
                "createdBy",
              select:
                "name email",
            })
            .sort({
              occurredAt:
                -1,

              createdAt:
                -1,
            })
            .skip(skip)
            .limit(
              numericLimit
            )
            .lean(),

          PersonHistory.countDocuments(
            filter
          ),
        ]);

      const totalPages =
        Math.max(
          Math.ceil(
            total /
              numericLimit
          ),
          1
        );

      // ==================================================
      // CATÉGORIES DISPONIBLES POUR CETTE PERSONNE
      // ==================================================

      const categories =
        await PersonHistory.distinct(
          "category",
          {
            church:
              req.churchId,

            member:
              memberId,
          }
        );

      // ==================================================
      // RÉSUMÉ
      // ==================================================

      const summary =
        await PersonHistory.aggregate([
          {
            $match: {
              church:
                new mongoose.Types.ObjectId(
                  req.churchId
                ),

              member:
                new mongoose.Types.ObjectId(
                  memberId
                ),
            },
          },

          {
            $group: {
              _id:
                "$category",

              count: {
                $sum: 1,
              },
            },
          },

          {
            $sort: {
              count: -1,
            },
          },
        ]);

      // ==================================================
      // RÉPONSE
      // ==================================================

      return res
        .status(200)
        .json({
          success: true,

          data: {
            member,

            history,

            categories,

            summary:
              summary.map(
                (item) => ({
                  category:
                    item._id,

                  count:
                    item.count,
                })
              ),
          },

          pagination: {
            page:
              numericPage,

            limit:
              numericLimit,

            total,

            totalPages,
          },
        });
    } catch (error) {
      console.error(
        "Erreur getMemberHistory :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors du chargement de l'historique de la personne.",

          error:
            process.env
              .NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
    }
  };

// ======================================================
// AJOUTER UNE NOTE MANUELLE
// POST /api/person-history/member/:memberId/note
// ======================================================

const addMemberHistoryNote =
  async (req, res) => {
    try {
      const {
        memberId,
      } = req.params;

      const {
        title,
        description = "",
        category =
          "Administration",
        occurredAt = null,
        visibility =
          "standard",
      } = req.body;

      // ==================================================
      // ID VALIDE
      // ==================================================

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
              "Identifiant de la personne invalide.",
          });
      }

      // ==================================================
      // TITRE OBLIGATOIRE
      // ==================================================

      if (
        !title ||
        !title.trim()
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Le titre de la note est obligatoire.",
          });
      }

      // ==================================================
      // PERSONNE
      // ==================================================

      const member =
        await Member.findOne({
          _id:
            memberId,

          church:
            req.churchId,
        });

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Personne introuvable dans cette église.",
          });
      }

      // ==================================================
      // CRÉATION
      // ==================================================

      const history =
        await PersonHistory.create({
          church:
            req.churchId,

          member:
            member._id,

          type:
            "NOTE_ADDED",

          category,

          title:
            title.trim(),

          description:
            typeof description ===
            "string"
              ? description.trim()
              : "",

          occurredAt:
            occurredAt ||
            new Date(),

          sourceType:
            "ManualNote",

          sourceId:
            null,

          metadata: {},

          createdBy:
            req.user?._id ||
            null,

          createdByName:
            req.user?.name ||
            "Système",

          origin:
            "manual",

          visibility:
            visibility ||
            "standard",
        });

      const populated =
        await PersonHistory.findById(
          history._id
        )
          .populate({
            path:
              "createdBy",
            select:
              "name email",
          })
          .lean();

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Note ajoutée à l'historique avec succès.",

          data:
            populated,
        });
    } catch (error) {
      console.error(
        "Erreur addMemberHistoryNote :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors de l'ajout de la note à l'historique.",

          error:
            process.env
              .NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
    }
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getMemberHistory,
  addMemberHistoryNote,
};