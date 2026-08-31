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
  getActivityLogs,
  clearActivityLogs,
} = require(
  "../controllers/activityLogController"
);

// ======================================================
// LECTURE DU JOURNAL D'ACTIVITÉ
//
// FREE      = interdit
// STANDARD  = interdit
// PREMIUM   = autorisé
//
// GET /api/activity-logs
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("activityLogs"),
  authorizeRoles("admin"),
  getActivityLogs
);

// ======================================================
// SUPPRESSION COMPLÈTE DU JOURNAL
//
// FREE      = interdit
// STANDARD  = interdit
// PREMIUM   = autorisé
//
// DELETE /api/activity-logs
// ======================================================

router.delete(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("activityLogs"),
  authorizeRoles("admin"),
  clearActivityLogs
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;