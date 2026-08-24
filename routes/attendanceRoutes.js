const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");
const requireChurch = require("../middleware/tenantMiddleware");

const {
  markAttendance,
  getAttendances,
  getAttendancesByEvent,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary,
} = require("../controllers/attendanceController");

// ======================================================
// DEBUG AU DÉMARRAGE
// ======================================================

console.log("ATTENDANCE ROUTES CHECK :", {
  protect: typeof protect,
  requireChurch: typeof requireChurch,
  markAttendance: typeof markAttendance,
  getAttendances: typeof getAttendances,
  getAttendancesByEvent: typeof getAttendancesByEvent,
  getAttendanceById: typeof getAttendanceById,
  updateAttendance: typeof updateAttendance,
  deleteAttendance: typeof deleteAttendance,
  getAttendanceSummary: typeof getAttendanceSummary,
});

// ======================================================
// RÉSUMÉ
// ======================================================

router.get(
  "/summary",
  protect,
  requireChurch,
  getAttendanceSummary
);

// ======================================================
// PRÉSENCES PAR ÉVÉNEMENT
// ======================================================

router.get(
  "/event/:eventId",
  protect,
  requireChurch,
  getAttendancesByEvent
);

// ======================================================
// LISTE
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  getAttendances
);

// ======================================================
// CRÉER
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  markAttendance
);

// ======================================================
// DÉTAIL
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  getAttendanceById
);

// ======================================================
// MODIFIER
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  updateAttendance
);

// ======================================================
// SUPPRIMER
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  deleteAttendance
);

module.exports = router;