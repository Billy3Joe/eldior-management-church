const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const eventController = require("../controllers/eventController");

router.post("/", protect, eventController.createEvent);
router.get("/", protect, eventController.getEvents);
router.get("/:id", protect, eventController.getEventById);
router.put("/:id", protect, eventController.updateEvent);
router.delete("/:id", protect, eventController.deleteEvent);

module.exports = router;