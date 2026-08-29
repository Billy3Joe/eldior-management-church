const express = require("express");

const router = express.Router();

const protect = require(
  "../middleware/authMiddleware"
);

const requireChurch = require(
  "../middleware/tenantMiddleware"
);

const authorizeRoles = require(
  "../middleware/roleMiddleware"
);

const {
  requireActiveSubscription,
  requireFeature,
} = require(
  "../middleware/subscriptionMiddleware"
);

const {
  getActivityLogs,
  clearActivityLogs,
} = require(
  "../controllers/activityLogController"
);

// Lecture
router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("activityLogs"),
  authorizeRoles("admin"),
  getActivityLogs
);

// Suppression complète
router.delete(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("activityLogs"),
  authorizeRoles("admin"),
  clearActivityLogs
);

module.exports = router;