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
} = require(
  "../middleware/subscriptionMiddleware"
);

// ======================================================
// CONTROLLER
// ======================================================

const {
  getSettings,
  updateSettings,
} = require(
  "../controllers/settingsController"
);

// ======================================================
// LIRE LES PARAMÈTRES
//
// ADMIN + MANAGER
// TOUS LES PLANS
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
  getSettings
);

// ======================================================
// MODIFIER LES PARAMÈTRES
//
// ADMIN UNIQUEMENT
//
// Les restrictions Free / Standard / Premium
// sont contrôlées précisément dans le controller.
// ======================================================

router.put(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles("admin"),
  updateSettings
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;