const express = require("express");

const protect = require("../middleware/authMiddleware");
const requireChurch = require("../middleware/tenantMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  getChurchReconciliation,
  getAccountReconciliation,
  repairAccountReconciliation,
} = require("../controllers/financeReconciliationController");

const router = express.Router();

// ======================================================
// MIDDLEWARES GLOBAUX
// ======================================================

router.use(protect, requireChurch);

// ======================================================
// RÉCONCILIATION GLOBALE
// Admin + Manager
// ======================================================

router.get(
  "/",
  authorizeRoles("admin", "manager"),
  getChurchReconciliation
);

// ======================================================
// RÉCONCILIATION D'UN COMPTE
// Admin + Manager
// ======================================================

router.get(
  "/accounts/:accountId",
  authorizeRoles("admin", "manager"),
  getAccountReconciliation
);

// ======================================================
// RÉPARATION D'UN SOLDE
//
// Opération sensible :
// réservée aux administrateurs.
// ======================================================

router.post(
  "/accounts/:accountId/repair",
  authorizeRoles("admin"),
  repairAccountReconciliation
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;