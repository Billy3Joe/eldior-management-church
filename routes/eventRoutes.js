const express = require("express");
const router = express.Router();

const protect = require(
  "../middleware/authMiddleware"
);

const requireChurch = require(
  "../middleware/tenantMiddleware"
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

router.get(
  "/",
  protect,
  requireChurch,
  getEvents
);

router.post(
  "/",
  protect,
  requireChurch,
  createEvent
);

router.get(
  "/:id",
  protect,
  requireChurch,
  getEventById
);

router.put(
  "/:id",
  protect,
  requireChurch,
  updateEvent
);

router.delete(
  "/:id",
  protect,
  requireChurch,
  deleteEvent
);

module.exports = router;