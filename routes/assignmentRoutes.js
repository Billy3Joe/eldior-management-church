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
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,

  confirmAssignment,
  declineAssignment,

  getAssignmentStats,

  getPublicAssignment,
  respondToAssignment,

  resendAssignmentEmail,
} = require(
  "../controllers/assignmentController"
);

// ======================================================
// PUBLIC
// ======================================================

router.get(
  "/public/:token",
  getPublicAssignment
);

router.post(
  "/public/:token/respond",
  respondToAssignment
);

// ======================================================
// STATS
// ======================================================

router.get(
  "/stats",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles("admin", "manager"),
  getAssignmentStats
);

// ======================================================
// LISTE
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles("admin", "manager"),
  getAssignments
);

// ======================================================
// CRÉATION
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles("admin", "manager"),
  createAssignment
);

// ======================================================
// RENVOI EMAIL
// ======================================================

router.post(
  "/:id/resend-email",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  requireFeature("emailNotifications"),
  authorizeRoles("admin", "manager"),
  resendAssignmentEmail
);

// ======================================================
// CONFIRMER
// ======================================================

router.patch(
  "/:id/confirm",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles("admin", "manager"),
  confirmAssignment
);

// ======================================================
// REFUSER
// ======================================================

router.patch(
  "/:id/decline",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles("admin", "manager"),
  declineAssignment
);

// ======================================================
// DÉTAIL
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles("admin", "manager"),
  getAssignmentById
);

// ======================================================
// MODIFICATION
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles("admin", "manager"),
  updateAssignment
);

// ======================================================
// SUPPRESSION
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles("admin", "manager"),
  deleteAssignment
);

module.exports = router;