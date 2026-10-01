const express = require("express");

const router = express.Router();

const {
  getFinanceAccounts,
  getFinanceAccountById,
  createFinanceAccount,
  updateFinanceAccount,
  toggleFinanceAccountStatus,
  setDefaultFinanceAccount,
  deleteFinanceAccount,
  getFinanceAccountStats,
} = require("../controllers/financeAccountController");

const authMiddleware = require("../middleware/authMiddleware");
const protect = authMiddleware.protect || authMiddleware;

const requireChurch = require("../middleware/tenantMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// ======================================================
// MIDDLEWARES GLOBAUX
// ======================================================

router.use(protect, requireChurch);

// ======================================================
// STATISTIQUES
// GET /api/finance/accounts/stats/summary
// ======================================================

router.get(
  "/stats/summary",
  authorizeRoles("admin", "manager"),
  getFinanceAccountStats
);

// ======================================================
// LISTE DES COMPTES
// GET /api/finance/accounts
// ======================================================

router.get(
  "/",
  authorizeRoles("admin", "manager"),
  getFinanceAccounts
);

// ======================================================
// DÉTAIL D'UN COMPTE
// GET /api/finance/accounts/:id
// ======================================================

router.get(
  "/:id",
  authorizeRoles("admin", "manager"),
  getFinanceAccountById
);

// ======================================================
// CRÉATION D'UN COMPTE
// POST /api/finance/accounts
// ======================================================

router.post(
  "/",
  authorizeRoles("admin", "manager"),
  createFinanceAccount
);

// ======================================================
// MODIFICATION D'UN COMPTE
// PUT /api/finance/accounts/:id
// ======================================================

router.put(
  "/:id",
  authorizeRoles("admin", "manager"),
  updateFinanceAccount
);

// ======================================================
// ACTIVER / DÉSACTIVER
// PATCH /api/finance/accounts/:id/status
// ======================================================

router.patch(
  "/:id/status",
  authorizeRoles("admin", "manager"),
  toggleFinanceAccountStatus
);

// ======================================================
// DÉFINIR COMME COMPTE PAR DÉFAUT
// PATCH /api/finance/accounts/:id/default
// ======================================================

router.patch(
  "/:id/default",
  authorizeRoles("admin", "manager"),
  setDefaultFinanceAccount
);

// ======================================================
// SUPPRESSION D'UN COMPTE
// DELETE /api/finance/accounts/:id
// ======================================================

router.delete(
  "/:id",
  authorizeRoles("admin"),
  deleteFinanceAccount
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;