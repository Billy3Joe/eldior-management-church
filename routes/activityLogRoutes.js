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
  getActivityLogs,
  clearActivityLogs,
} = require(
  "../controllers/activityLogController"
);

// ======================================================
// JOURNAL D'ACTIVITÉ
// ADMIN UNIQUEMENT
// ======================================================

// Lire le journal
router.get(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  getActivityLogs
);

// ======================================================
// VIDER LE JOURNAL
// ADMIN UNIQUEMENT
// ======================================================

router.delete(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  clearActivityLogs
);

module.exports = router;