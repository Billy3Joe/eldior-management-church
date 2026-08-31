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
//
// Ces routes ne demandent pas de connexion.
// Elles servent au membre qui reçoit un lien par email.
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
// STATISTIQUES
//
// FREE      = interdit
// STANDARD  = autorisé
// PREMIUM   = autorisé
// ======================================================

router.get(
  "/stats",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAssignmentStats
);

// ======================================================
// LISTE DES ASSIGNATIONS
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAssignments
);

// ======================================================
// CRÉATION D'UNE ASSIGNATION
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  createAssignment
);

// ======================================================
// RENVOYER L'EMAIL
//
// assignments requis
// +
// emailNotifications requis
//
// FREE      = interdit
// STANDARD  = autorisé
// PREMIUM   = autorisé
// ======================================================

router.post(
  "/:id/resend-email",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  requireFeature(
    "emailNotifications"
  ),
  authorizeRoles(
    "admin",
    "manager"
  ),
  resendAssignmentEmail
);

// ======================================================
// CONFIRMER UNE ASSIGNATION
// ======================================================

router.patch(
  "/:id/confirm",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  confirmAssignment
);

// ======================================================
// REFUSER UNE ASSIGNATION
// ======================================================

router.patch(
  "/:id/decline",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  declineAssignment
);

// ======================================================
// DÉTAIL D'UNE ASSIGNATION
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAssignmentById
);

// ======================================================
// MODIFICATION D'UNE ASSIGNATION
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  updateAssignment
);

// ======================================================
// SUPPRESSION D'UNE ASSIGNATION
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("assignments"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  deleteAssignment
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;