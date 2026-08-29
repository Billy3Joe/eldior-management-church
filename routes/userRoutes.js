const express = require("express");

const router = express.Router();

const User = require(
  "../models/User"
);

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
  enforceResourceLimit,
} = require(
  "../middleware/subscriptionMiddleware"
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
// CRÉATION
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
// DÉTAIL
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
// MODIFICATION
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
// SUPPRESSION
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles("admin"),
  deleteUser
);

module.exports = router;