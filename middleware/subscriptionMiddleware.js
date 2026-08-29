const Church = require(
    "../models/Church"
  );
  
  const {
    getPlanConfig,
  } = require(
    "../config/planLimits"
  );
  
  // ======================================================
  // CHARGER L'ABONNEMENT DE L'ÉGLISE
  // ======================================================
  
  const requireActiveSubscription =
    async (req, res, next) => {
      try {
        if (!req.churchId) {
          return res.status(403).json({
            success: false,
            message:
              "Aucune église associée à cet utilisateur",
          });
        }
  
        const church =
          await Church.findById(
            req.churchId
          );
  
        if (!church) {
          return res.status(404).json({
            success: false,
            message:
              "Église introuvable",
          });
        }
  
        if (
          church.status &&
          church.status !== "active"
        ) {
          return res.status(403).json({
            success: false,
            code:
              "SUBSCRIPTION_INACTIVE",
            message:
              "L'abonnement de cette église n'est pas actif",
          });
        }
  
        const plan =
          church.plan || "free";
  
        const planConfig =
          getPlanConfig(plan);
  
        req.church =
          church;
  
        req.subscription = {
          plan,
          config: planConfig,
        };
  
        next();
      } catch (error) {
        console.error(
          "Erreur requireActiveSubscription :",
          error
        );
  
        return res.status(500).json({
          success: false,
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
      return (req, res, next) => {
        const subscription =
          req.subscription;
  
        if (!subscription) {
          return res.status(500).json({
            success: false,
            message:
              "Abonnement non initialisé",
          });
        }
  
        const enabled =
          subscription.config
            ?.features?.[
            featureName
          ];
  
        if (!enabled) {
          return res.status(403).json({
            success: false,
            code:
              "FEATURE_NOT_AVAILABLE",
  
            feature:
              featureName,
  
            plan:
              subscription.plan,
  
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
    }) =>
    async (req, res, next) => {
      try {
        if (
          !req.subscription
        ) {
          return res.status(500).json({
            success: false,
            message:
              "Abonnement non initialisé",
          });
        }
  
        const limit =
          req.subscription.config
            ?.limits?.[
            resource
          ];
  
        // null = illimité
        if (
          limit === null ||
          typeof limit ===
            "undefined"
        ) {
          return next();
        }
  
        const currentCount =
          await Model.countDocuments({
            church:
              req.churchId,
          });
  
        if (
          currentCount >= limit
        ) {
          return res.status(403).json({
            success: false,
  
            code:
              "PLAN_LIMIT_REACHED",
  
            resource,
  
            plan:
              req.subscription.plan,
  
            limit,
  
            current:
              currentCount,
  
            message:
              `Limite atteinte : votre abonnement autorise au maximum ${limit} ${resource}`,
          });
        }
  
        next();
      } catch (error) {
        console.error(
          "Erreur enforceResourceLimit :",
          error
        );
  
        return res.status(500).json({
          success: false,
          message:
            "Impossible de vérifier la limite de l'abonnement",
        });
      }
    };
  
  module.exports = {
    requireActiveSubscription,
    requireFeature,
    enforceResourceLimit,
  };