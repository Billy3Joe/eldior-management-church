const express = require("express");

const router = express.Router();

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
  markAttendance,
  getAttendances,
  getAttendancesByEvent,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary,
} = require(
  "../controllers/attendanceController"
);

// ======================================================
// TOUTES LES PRÉSENCES
// ADMIN + MANAGER
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAttendances
);

// ======================================================
// RÉSUMÉ DES PRÉSENCES
// IMPORTANT : cette route doit rester AVANT /:id
// ======================================================

router.get(
  "/summary",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAttendanceSummary
);

// ======================================================
// PRÉSENCES PAR ÉVÉNEMENT
// ======================================================

router.get(
  "/event/:eventId",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAttendancesByEvent
);

// ======================================================
// UNE PRÉSENCE
// ======================================================

router.get(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getAttendanceById
);

// ======================================================
// ENREGISTRER UNE PRÉSENCE
// ======================================================

router.post(
  "/",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  markAttendance
);

// ======================================================
// MODIFIER UNE PRÉSENCE
// ======================================================

router.put(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  updateAttendance
);

// ======================================================
// SUPPRIMER UNE PRÉSENCE
// ADMIN + MANAGER
// ======================================================

router.delete(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  deleteAttendance
);

module.exports = router;