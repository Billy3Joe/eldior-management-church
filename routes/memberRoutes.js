const express = require("express");

const router = express.Router();

const Member = require(
  "../models/Member"
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
  requireFeature,
  enforceResourceLimit,
} = require(
  "../middleware/subscriptionMiddleware"
);

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
// LISTE
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("members"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  getMembers
);

// ======================================================
// CRÉATION
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("members"),
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
// DÉTAIL
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("members"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  getMemberById
);

// ======================================================
// MODIFICATION
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("members"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  updateMember
);

// ======================================================
// SUPPRESSION
// ADMIN UNIQUEMENT
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("members"),
  authorizeRoles("admin"),
  deleteMember
);

module.exports = router;