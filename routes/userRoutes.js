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
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  deleteUser,
} = require(
  "../controllers/userController"
);

// ======================================================
// TOUTES LES ROUTES UTILISATEURS
// ADMIN UNIQUEMENT
// ======================================================

// Liste des utilisateurs de l'église
router.get(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  getUsers
);

// Créer un utilisateur
router.post(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  createUser
);

// ======================================================
// ROUTES SPÉCIALES
// AVANT /:id
// ======================================================

// Activer / désactiver un utilisateur
router.patch(
  "/:id/toggle-status",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  toggleUserStatus
);

// ======================================================
// DÉTAIL UTILISATEUR
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  getUserById
);

// ======================================================
// MODIFIER UTILISATEUR
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  updateUser
);

// ======================================================
// SUPPRIMER UTILISATEUR
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  deleteUser
);

module.exports = router;