const express = require("express");

const router = express.Router();

const {
  getFinanceTransactions,
  getFinanceTransactionById,
  createFinanceTransaction,
  updateFinanceTransaction,
  confirmFinanceTransaction,
  cancelFinanceTransaction,
  deleteFinanceTransaction,
  getFinanceTransactionStats,
} = require("../controllers/financeTransactionController");

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
// GET /api/finance/transactions/stats/summary
// ======================================================

router.get(
  "/stats/summary",
  authorizeRoles("admin", "manager"),
  getFinanceTransactionStats
);

// ======================================================
// LISTE DES TRANSACTIONS
// GET /api/finance/transactions
// ======================================================

router.get(
  "/",
  authorizeRoles("admin", "manager"),
  getFinanceTransactions
);

// ======================================================
// DÉTAIL D'UNE TRANSACTION
// GET /api/finance/transactions/:id
// ======================================================

router.get(
  "/:id",
  authorizeRoles("admin", "manager"),
  getFinanceTransactionById
);

// ======================================================
// CRÉATION
// POST /api/finance/transactions
// ======================================================

router.post(
  "/",
  authorizeRoles("admin", "manager"),
  createFinanceTransaction
);

// ======================================================
// MODIFICATION D'UN BROUILLON
// PUT /api/finance/transactions/:id
// ======================================================

router.put(
  "/:id",
  authorizeRoles("admin", "manager"),
  updateFinanceTransaction
);

// ======================================================
// CONFIRMATION D'UN BROUILLON
// PATCH /api/finance/transactions/:id/confirm
// ======================================================

router.patch(
  "/:id/confirm",
  authorizeRoles("admin", "manager"),
  confirmFinanceTransaction
);

// ======================================================
// ANNULATION D'UNE TRANSACTION
// PATCH /api/finance/transactions/:id/cancel
// ======================================================

router.patch(
  "/:id/cancel",
  authorizeRoles("admin", "manager"),
  cancelFinanceTransaction
);

// ======================================================
// SUPPRESSION D'UN BROUILLON
// DELETE /api/finance/transactions/:id
// ======================================================

router.delete(
  "/:id",
  authorizeRoles("admin"),
  deleteFinanceTransaction
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;