const express = require("express");

const router = express.Router();

// ======================================================
// AUTH
// ======================================================

const authMiddleware = require(
  "../middleware/authMiddleware"
);

const protect =
  authMiddleware.protect ||
  authMiddleware;

// ======================================================
// TENANT
// ======================================================

const requireChurch = require(
  "../middleware/tenantMiddleware"
);

// ======================================================
// RÔLES
// ======================================================

const authorizeRoles = require(
  "../middleware/roleMiddleware"
);

// ======================================================
// ABONNEMENT
// ======================================================

const {
  requireActiveSubscription,
} = require(
  "../middleware/subscriptionMiddleware"
);

// ======================================================
// CONTROLLER
// ======================================================

const {
  getStages,
  getJourneyStats,
  getMemberJourney,
  getMemberJourneyHistory,
  changeMemberStage,
  updateMemberSupport,
} = require(
  "../controllers/spiritualJourneyController"
);

// ======================================================
// MIDDLEWARES COMMUNS
// ======================================================

router.use(
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  )
);

// ======================================================
// LISTE DES ÉTAPES
// ======================================================

router.get(
  "/stages",
  getStages
);

// ======================================================
// STATISTIQUES
// ======================================================

router.get(
  "/stats",
  getJourneyStats
);

// ======================================================
// PARCOURS D'UNE PERSONNE
// ======================================================

router.get(
  "/member/:memberId",
  getMemberJourney
);

// ======================================================
// HISTORIQUE DU PARCOURS
// ======================================================

router.get(
  "/member/:memberId/history",
  getMemberJourneyHistory
);

// ======================================================
// CHANGER L'ÉTAPE
// ======================================================

router.put(
  "/member/:memberId/stage",
  changeMemberStage
);

// ======================================================
// ACCOMPAGNEMENT SPIRITUEL
// ======================================================

router.put(
  "/member/:memberId/support",
  updateMemberSupport
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;