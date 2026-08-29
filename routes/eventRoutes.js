const express = require("express");

const router = express.Router();

const Event = require(
  "../models/Event"
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
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} = require(
  "../controllers/eventController"
);

// Liste
router.get(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),
  authorizeRoles("admin", "manager"),
  getEvents
);

// Création
router.post(
  "/",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),
  authorizeRoles("admin", "manager"),

  enforceResourceLimit({
    resource: "events",
    Model: Event,
  }),

  createEvent
);

// Détail
router.get(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),
  authorizeRoles("admin", "manager"),
  getEventById
);

// Modification
router.put(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),
  authorizeRoles("admin", "manager"),
  updateEvent
);

// Suppression admin uniquement
router.delete(
  "/:id",
  protect,
  requireChurch,
  requireActiveSubscription,
  requireFeature("events"),
  authorizeRoles("admin"),
  deleteEvent
);

module.exports = router;