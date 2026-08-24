const express = require("express");

const router = express.Router();

const protect = require(
  "../middleware/authMiddleware"
);

const requireChurch = require(
  "../middleware/tenantMiddleware"
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
// ROUTES PUBLIQUES
// IMPORTANT : AVANT /:id
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
  "/stats/global",
  protect,
  requireChurch,
  getAssignmentStats
);

// ======================================================
// LISTE + CRÉATION
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  getAssignments
);

router.post(
  "/",
  protect,
  requireChurch,
  createAssignment
);

// ======================================================
// ACTIONS
// ======================================================

router.put(
  "/:id/confirm",
  protect,
  requireChurch,
  confirmAssignment
);

router.put(
  "/:id/decline",
  protect,
  requireChurch,
  declineAssignment
);

router.post(
  "/:id/resend-email",
  protect,
  requireChurch,
  resendAssignmentEmail
);

// ======================================================
// ROUTES PAR ID
// Toujours garder après les routes spéciales.
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  getAssignmentById
);

router.put(
  "/:id",
  protect,
  requireChurch,
  updateAssignment
);

router.delete(
  "/:id",
  protect,
  requireChurch,
  deleteAssignment
);

module.exports = router;