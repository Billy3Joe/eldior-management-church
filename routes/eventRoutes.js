const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");
const requireChurch = require("../middleware/tenantMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} = require("../controllers/eventController");

router.get(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  getEvents
);

router.get(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  getEventById
);

router.post(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  createEvent
);

router.put(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  updateEvent
);

router.delete(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  deleteEvent
);

module.exports = router;