const express = require("express");

const router = express.Router();

const Member = require(
  "../models/Member"
);

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
  enforceResourceLimit,
} = require(
  "../middleware/subscriptionMiddleware"
);

// ======================================================
// CONTROLLER
// ======================================================

const {
  createMember,
  getMembers,
  getMemberById,
  updateMember,
  deleteMember,
} = require(
  "../controllers/memberController"
);

// ======================================================
// LISTE DES MEMBRES
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getMembers
);

// ======================================================
// CRÉATION D'UN MEMBRE
//
// FREE      = 50 membres maximum
// STANDARD  = 300 membres maximum
// PREMIUM   = illimité
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  enforceResourceLimit({
    resource: "members",
    Model: Member,
  }),
  createMember
);

// ======================================================
// DÉTAIL D'UN MEMBRE
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getMemberById
);

// ======================================================
// MODIFICATION D'UN MEMBRE
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  ),
  updateMember
);

// ======================================================
// SUPPRESSION D'UN MEMBRE
//
// ADMIN UNIQUEMENT
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles("admin"),
  deleteMember
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;