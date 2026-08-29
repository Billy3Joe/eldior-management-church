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
  getGlobalReport,
  getEventReport,
} = require(
  "../controllers/reportController"
);

// Rapport global
router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("reports"),
  authorizeRoles("admin", "manager"),
  getGlobalReport
);

// Rapport événement
router.get(
  "/event/:eventId",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("reports"),
  authorizeRoles("admin", "manager"),
  getEventReport
);

module.exports = router;