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
// ======================================================
// Ces routes sont utilisées depuis l'email.
// Elles ne nécessitent ni JWT ni connexion.
// ======================================================

// Afficher une programmation avec le token
router.get(
  "/public/:token",
  getPublicAssignment
);

// Confirmer ou refuser depuis l'email
router.post(
  "/public/:token/respond",
  respondToAssignment
);

// ======================================================
// STATISTIQUES
// ADMIN + MANAGER
// IMPORTANT : AVANT /:id
// ======================================================

router.get(
  "/stats",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAssignmentStats
);

// ======================================================
// LISTE DES PROGRAMMATIONS
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAssignments
);

// ======================================================
// CRÉER UNE PROGRAMMATION
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  createAssignment
);

// ======================================================
// RENVOYER EMAIL
// IMPORTANT : AVANT /:id
// ======================================================

router.post(
  "/:id/resend-email",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  resendAssignmentEmail
);

// ======================================================
// CONFIRMER MANUELLEMENT
// ADMIN + MANAGER
// ======================================================

router.patch(
  "/:id/confirm",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  confirmAssignment
);

// ======================================================
// REFUSER MANUELLEMENT
// ADMIN + MANAGER
// ======================================================

router.patch(
  "/:id/decline",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  declineAssignment
);

// ======================================================
// DÉTAIL D'UNE PROGRAMMATION
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAssignmentById
);

// ======================================================
// MODIFIER UNE PROGRAMMATION
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  updateAssignment
);

// ======================================================
// SUPPRIMER UNE PROGRAMMATION
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  deleteAssignment
);

module.exports = router;