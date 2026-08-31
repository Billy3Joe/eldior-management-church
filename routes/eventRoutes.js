const express = require("express");

const router = express.Router();

const Event = require(
  "../models/Event"
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
  requireFeature,
  enforceResourceLimit,
} = require(
  "../middleware/subscriptionMiddleware"
);

// ======================================================
// CONTROLLER
// ======================================================

const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} = require(
  "../controllers/eventController"
);

// ======================================================
// LISTE DES ÉVÉNEMENTS
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),
  authorizeRoles(
    "admin",
    "manager"
  ),
  getEvents
);

// ======================================================
// CRÉATION D'UN ÉVÉNEMENT
//
// FREE      = 10 événements maximum
// STANDARD  = 100 événements maximum
// PREMIUM   = illimité
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),

  authorizeRoles(
    "admin",
    "manager"
  ),

  enforceResourceLimit({
    resource: "events",
    Model: Event,
  }),

  createEvent
);

// ======================================================
// DÉTAIL D'UN ÉVÉNEMENT
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),

  authorizeRoles(
    "admin",
    "manager"
  ),

  getEventById
);

// ======================================================
// MODIFICATION D'UN ÉVÉNEMENT
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),

  authorizeRoles(
    "admin",
    "manager"
  ),

  updateEvent
);

// ======================================================
// SUPPRESSION D'UN ÉVÉNEMENT
// ADMIN UNIQUEMENT
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),

  authorizeRoles("admin"),

  deleteEvent
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;