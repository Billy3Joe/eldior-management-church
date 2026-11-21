
const express = require("express");
const router = express.Router();

// ======================================================
// AUTHENTIFICATION
// ======================================================

const authMiddleware = require(
  "../middleware/authMiddleware"
);

const protect =
  authMiddleware.protect || authMiddleware;

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
// ABONNEMENT ET LIMITES
// ======================================================

const subscriptionMiddleware = require(
  "../middleware/subscriptionMiddleware"
);

const {
  requireActiveSubscription,
  requireFeature,
  enforceResourceLimit,
} = subscriptionMiddleware;

// ======================================================
// MODÈLE
// ======================================================

const Event = require("../models/Event");

// ======================================================
// CONTROLLER
// ======================================================

const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  closeEventAttendance,
  reopenEventAttendance,
} = require(
  "../controllers/eventController"
);

// ======================================================
// MIDDLEWARES COMMUNS
// ======================================================

router.use(
  protect,
  requireChurch,
  requireActiveSubscription
);

// ======================================================
// VÉRIFICATION DE LA FONCTIONNALITÉ
// ======================================================

router.use(
  requireFeature("events")
);

// ======================================================
// LISTE DES ÉVÉNEMENTS
// ======================================================

router.get(
  "/",
  authorizeRoles("admin", "manager"),
  getEvents
);

// ======================================================
// CRÉATION D'UN ÉVÉNEMENT
// ======================================================

router.post(
  "/",
  authorizeRoles("admin", "manager"),
  enforceResourceLimit({
    resource: "events",
    Model: Event,
  }),
  createEvent
);

// ======================================================
// CLÔTURE DES POINTAGES
// ======================================================

router.post(
  "/:id/attendance/close",
  authorizeRoles("admin", "manager"),
  closeEventAttendance
);

// ======================================================
// RÉOUVERTURE DES POINTAGES
// ======================================================

router.post(
  "/:id/attendance/reopen",
  authorizeRoles("admin"),
  reopenEventAttendance
);

// ======================================================
// DÉTAIL D'UN ÉVÉNEMENT
// ======================================================

router.get(
  "/:id",
  authorizeRoles("admin", "manager"),
  getEventById
);

// ======================================================
// MODIFICATION D'UN ÉVÉNEMENT
// ======================================================

router.put(
  "/:id",
  authorizeRoles("admin", "manager"),
  updateEvent
);

// ======================================================
// SUPPRESSION D'UN ÉVÉNEMENT
// ======================================================

router.delete(
  "/:id",
  authorizeRoles("admin"),
  deleteEvent
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;
