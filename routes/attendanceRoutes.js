const express = require("express");

const router = express.Router();

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
// CONTROLLER
// ======================================================

const {
  markAttendance,
  getAttendances,
  getAttendancesByEvent,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary,
  getEventAttendanceAnalytics,
  getGlobalAttendanceAnalytics,
  getSundayAttendanceAnalytics,
} = require(
  "../controllers/attendanceController"
);

// ======================================================
// TOUTES LES PRÉSENCES
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
// RÉSUMÉ
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
// STATISTIQUES GLOBALES
// IMPORTANT : avant /:id
// ======================================================

router.get(
  "/analytics/global",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getGlobalAttendanceAnalytics
);

// ======================================================
// STATISTIQUES PASTORALES DU DIMANCHE
// IMPORTANT : avant /:id
// ======================================================

router.get(
  "/analytics/sundays",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getSundayAttendanceAnalytics
);

// ======================================================
// STATISTIQUES D'UN ÉVÉNEMENT
// ======================================================

router.get(
  "/analytics/event/:eventId",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getEventAttendanceAnalytics
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
// POINTER UNE PRÉSENCE
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

// ======================================================
// EXPORT
// ======================================================

module.exports = router;