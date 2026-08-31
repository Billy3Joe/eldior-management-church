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
  requireFeature,
} = require(
  "../middleware/subscriptionMiddleware"
);

// ======================================================
// CONTROLLER
// ======================================================

const {
  getGlobalReport,
  getEventReport,
} = require(
  "../controllers/reportController"
);

// ======================================================
// RAPPORT GLOBAL
//
// FREE      = interdit
// STANDARD  = autorisé
// PREMIUM   = autorisé
//
// GET /api/reports
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("reports"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  getGlobalReport
);

// ======================================================
// RAPPORT D'UN ÉVÉNEMENT
//
// FREE      = interdit
// STANDARD  = autorisé
// PREMIUM   = autorisé
//
// GET /api/reports/event/:eventId
// ======================================================

router.get(
  "/event/:eventId",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("reports"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  getEventReport
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;