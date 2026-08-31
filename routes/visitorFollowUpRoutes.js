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
  getVisitorsFollowUp,
  getVisitorFollowUpStats,
  getVisitorFollowUpById,
  updateVisitorFollowUp,
  markVisitorAsContacted,
  integrateVisitor,
} = require(
  "../controllers/visitorFollowUpController"
);

// ======================================================
// STATISTIQUES DU SUIVI
// IMPORTANT : avant /:id
// ======================================================

router.get(
  "/stats",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getVisitorFollowUpStats
);

// ======================================================
// LISTE DES VISITEURS À SUIVRE
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getVisitorsFollowUp
);

// ======================================================
// MARQUER COMME CONTACTÉ
// ======================================================

router.patch(
  "/:id/contact",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  markVisitorAsContacted
);

// ======================================================
// INTÉGRER COMME MEMBRE
// ======================================================

router.patch(
  "/:id/integrate",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  integrateVisitor
);

// ======================================================
// DÉTAIL D'UN VISITEUR
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getVisitorFollowUpById
);

// ======================================================
// MODIFICATION DU SUIVI
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  updateVisitorFollowUp
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;