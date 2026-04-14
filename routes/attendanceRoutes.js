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
} = require("../controllers/attendanceController");

router.post("/", protect, createAttendance);
router.post("/mark", protect, markAttendance);

router.get("/", protect, getAttendances);
router.get("/event/:eventId/members", protect, getAttendanceByEvent);
router.get("/event/:eventId/summary", protect, getAttendanceSummaryByEvent);
router.get("/:id", protect, getAttendanceById);

router.put("/:id", protect, updateAttendance);
router.delete("/:id", protect, deleteAttendance);

module.exports = router;