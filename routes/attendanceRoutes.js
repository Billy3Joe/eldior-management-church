const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
  createAttendance,
  markAttendance,
  getAttendances,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getAttendanceByEvent,
  getAttendanceSummaryByEvent,
  getAttendanceAnalytics,
} = require("../controllers/attendanceController");

// Création / pointage
router.post("/", protect, createAttendance);
router.post("/mark", protect, markAttendance);

// Lecture
router.get("/", protect, getAttendances);
router.get("/analytics/global", protect, getAttendanceAnalytics);
router.get("/event/:eventId/members", protect, getAttendanceByEvent);
router.get("/event/:eventId/summary", protect, getAttendanceSummaryByEvent);
router.get("/:id", protect, getAttendanceById);

// Modification / suppression
router.put("/:id", protect, updateAttendance);
router.delete("/:id", protect, deleteAttendance);

module.exports = router;