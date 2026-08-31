const mongoose = require("mongoose");

const Church = require(
  "../models/Church"
);

const {
  getPlanConfig,
} = require(
  "../config/planLimits"
);

// ======================================================
// CHARGER ET VÉRIFIER L'ABONNEMENT DE L'ÉGLISE
// ======================================================

const requireActiveSubscription =
  async (req, res, next) => {
    try {
      // ==================================================
      // ÉGLISE REQUISE
      // ==================================================

      if (!req.churchId) {
        return res
          .status(403)
          .json({
            success: false,

            code:
              "CHURCH_REQUIRED",

            message:
              "Aucune église associée à cet utilisateur",
          });
      }

      // ==================================================
      // ID MONGODB VALIDE
      // ==================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          req.churchId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            code:
              "INVALID_CHURCH_ID",

            message:
              "Identifiant d'église invalide",
          });
      }

      // ==================================================
      // RÉCUPÉRER L'ÉGLISE
      // ==================================================

      const church =
        await Church.findById(
          req.churchId
        );

      if (!church) {
        return res
          .status(404)
          .json({
            success: false,

            code:
              "CHURCH_NOT_FOUND",

            message:
              "Église introuvable",
          });
      }

      // ==================================================
      // ÉGLISE DÉSACTIVÉE
      // ==================================================

      if (
        church.isActive ===
        false
      ) {
        return res
          .status(403)
          .json({
            success: false,

            code:
              "CHURCH_DISABLED",

            message:
              "Cette église est actuellement désactivée",
          });
      }

      // ==================================================
      // STATUT DE L'ÉGLISE
      // ==================================================

      const status =
        church.status ||
        "active";

      if (
        status !== "active"
      ) {
        let message =
          "L'abonnement de cette église n'est pas actif";

        if (
          status ===
          "suspended"
        ) {
          message =
            "Cette église est actuellement suspendue";
        }

        if (
          status ===
          "cancelled"
        ) {
          message =
            "L'abonnement de cette église a été annulé";
        }

        return res
          .status(403)
          .json({
            success: false,

            code:
              "SUBSCRIPTION_INACTIVE",

            status,

            message,
          });
      }

      // ==================================================
      // PLAN
      // ==================================================

      const plan =
        String(
          church.plan ||
            "free"
        ).toLowerCase();

      const planConfig =
        getPlanConfig(
          plan
        );

      // ==================================================
      // AJOUT AU REQUEST
      // ==================================================

      req.church =
        church;

      req.subscription = {
        plan,

        status,

        config:
          planConfig,

        churchId:
          church._id.toString(),
      };

      next();
    } catch (error) {
      console.error(
        "Erreur requireActiveSubscription :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          code:
            "SUBSCRIPTION_CHECK_ERROR",

          message:
            "Impossible de vérifier l'abonnement",
        });
    }
  };

// ======================================================
// VÉRIFIER UNE FONCTIONNALITÉ
// ======================================================

const requireFeature =
  (featureName) => {
    return (
      req,
      res,
      next
    ) => {
      // ==================================================
      // ABONNEMENT INITIALISÉ
      // ==================================================

      if (
        !req.subscription
      ) {
        return res
          .status(500)
          .json({
            success: false,

            code:
              "SUBSCRIPTION_NOT_INITIALIZED",

            message:
              "Abonnement non initialisé",
          });
      }

      // ==================================================
      // NOM DE FEATURE
      // ==================================================

      if (
        !featureName ||
        typeof featureName !==
          "string"
      ) {
        return res
          .status(500)
          .json({
            success: false,

            code:
              "INVALID_FEATURE_NAME",

            message:
              "Fonctionnalité d'abonnement invalide",
          });
      }

      // ==================================================
      // DISPONIBILITÉ
      // ==================================================

      const enabled =
        req.subscription
          .config
          ?.features?.[
          featureName
        ];

      if (
        enabled !== true
      ) {
        return res
          .status(403)
          .json({
            success: false,

            code:
              "FEATURE_NOT_AVAILABLE",

            feature:
              featureName,

            plan:
              req.subscription
                .plan,

            message:
              "Cette fonctionnalité n'est pas disponible avec votre abonnement actuel",
          });
      }

      next();
    };
  };

// ======================================================
// VÉRIFIER UNE LIMITE DE RESSOURCE
// ======================================================

const enforceResourceLimit =
  ({
    resource,
    Model,
    filter = {},
  }) => {
    return async (
      req,
      res,
      next
    ) => {
      try {
        // ==================================================
        // ABONNEMENT INITIALISÉ
        // ==================================================

        if (
          !req.subscription
        ) {
          return res
            .status(500)
            .json({
              success: false,

              code:
                "SUBSCRIPTION_NOT_INITIALIZED",

              message:
                "Abonnement non initialisé",
            });
        }

        // ==================================================
        // CONFIGURATION VALIDE
        // ==================================================

        if (
          !resource ||
          !Model
        ) {
          return res
            .status(500)
            .json({
              success: false,

              code:
                "RESOURCE_LIMIT_CONFIGURATION_ERROR",

              message:
                "Configuration de limite invalide",
            });
        }

        // ==================================================
        // RÉCUPÉRER LA LIMITE
        // ==================================================

        const limit =
          req.subscription
            .config
            ?.limits?.[
            resource
          ];

        // ==================================================
        // RESSOURCE NON CONFIGURÉE
        // ==================================================

        if (
          typeof limit ===
          "undefined"
        ) {
          console.warn(
            `⚠️ Aucune limite configurée pour la ressource "${resource}"`
          );

          return next();
        }

        // ==================================================
        // NULL = ILLIMITÉ
        // ==================================================

        if (
          limit === null
        ) {
          return next();
        }

        // ==================================================
        // LIMITE INVALIDE
        // ==================================================

        if (
          typeof limit !==
            "number" ||
          limit < 0
        ) {
          console.error(
            `❌ Limite invalide pour "${resource}" :`,
            limit
          );

          return res
            .status(500)
            .json({
              success: false,

              code:
                "INVALID_PLAN_LIMIT",

              message:
                "La limite configurée pour cette ressource est invalide",
            });
        }

        // ==================================================
        // COMPTER LES RESSOURCES DE CETTE ÉGLISE
        // ==================================================

        const currentCount =
          await Model.countDocuments(
            {
              church:
                req.churchId,

              ...filter,
            }
          );

        // ==================================================
        // LIMITE ATTEINTE
        // ==================================================

        if (
          currentCount >=
          limit
        ) {
          return res
            .status(403)
            .json({
              success: false,

              code:
                "PLAN_LIMIT_REACHED",

              resource,

              plan:
                req.subscription
                  .plan,

              limit,

              current:
                currentCount,

              remaining:
                0,

              message:
                `Limite atteinte : votre abonnement ${req.subscription.plan} autorise au maximum ${limit} ${resource}.`,
            });
        }

        // ==================================================
        // INFORMATIONS UTILES
        // ==================================================

        req.resourceLimit = {
          resource,

          current:
            currentCount,

          limit,

          remaining:
            Math.max(
              limit -
                currentCount,
              0
            ),
        };

        next();
      } catch (error) {
        console.error(
          `Erreur enforceResourceLimit (${resource}) :`,
          error
        );

        return res
          .status(500)
          .json({
            success: false,

            code:
              "RESOURCE_LIMIT_CHECK_ERROR",

            message:
              "Impossible de vérifier la limite de l'abonnement",
          });
      }
    };
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  requireActiveSubscription,
  requireFeature,
  enforceResourceLimit,
};