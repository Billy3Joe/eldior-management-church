const express = require("express");

const router = express.Router();

const User = require(
  "../models/User"
);

// ======================================================
// MIDDLEWARE AUTH
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
  enforceResourceLimit,
} = require(
  "../middleware/subscriptionMiddleware"
);

// ======================================================
// CONTROLLER
// ======================================================

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
// LISTE UTILISATEURS
// ADMIN UNIQUEMENT
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles("admin"),
  getUsers
);

// ======================================================
// CRÉATION UTILISATEUR
//
// FREE      = 2 utilisateurs maximum
// STANDARD  = 5 utilisateurs maximum
// PREMIUM   = illimité
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles("admin"),

  enforceResourceLimit({
    resource: "users",
    Model: User,
  }),

  createUser
);

// ======================================================
// ACTIVER / DÉSACTIVER
// ======================================================

router.patch(
  "/:id/toggle-status",
  protect,
  requireChurch,
  requireActiveSubscription,
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
  requireActiveSubscription,
  authorizeRoles("admin"),
  getUserById
);

// ======================================================
// MODIFICATION UTILISATEUR
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles("admin"),
  updateUser
);

// ======================================================
// SUPPRESSION UTILISATEUR
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles("admin"),
  deleteUser
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;