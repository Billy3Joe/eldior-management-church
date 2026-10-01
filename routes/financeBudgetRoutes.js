const express = require("express");

const router = express.Router();

const {
  getFinanceBudgets,
  getFinanceBudgetById,
  createFinanceBudget,
  updateFinanceBudget,
  changeFinanceBudgetStatus,
  deleteFinanceBudget,
  getFinanceBudgetStats,
} = require("../controllers/financeBudgetController");

const authMiddleware = require("../middleware/authMiddleware");
const protect = authMiddleware.protect || authMiddleware;

const requireChurch = require("../middleware/tenantMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// ======================================================
// MIDDLEWARES GLOBAUX
// ======================================================

router.use(protect, requireChurch);

// ======================================================
// STATISTIQUES BUDGÉTAIRES
// GET /api/finance/budgets/stats/summary
//
// IMPORTANT : cette route doit rester avant "/:id"
// ======================================================

router.get(
  "/stats/summary",
  authorizeRoles("admin", "manager"),
  getFinanceBudgetStats
);

// ======================================================
// LISTE DES BUDGETS
// GET /api/finance/budgets
// ======================================================

router.get(
  "/",
  authorizeRoles("admin", "manager"),
  getFinanceBudgets
);

// ======================================================
// DÉTAIL D'UN BUDGET
// GET /api/finance/budgets/:id
// ======================================================

router.get(
  "/:id",
  authorizeRoles("admin", "manager"),
  getFinanceBudgetById
);

// ======================================================
// CRÉATION D'UN BUDGET
// POST /api/finance/budgets
// ======================================================

router.post(
  "/",
  authorizeRoles("admin", "manager"),
  createFinanceBudget
);

// ======================================================
// MODIFICATION D'UN BUDGET
// PUT /api/finance/budgets/:id
// ======================================================

router.put(
  "/:id",
  authorizeRoles("admin", "manager"),
  updateFinanceBudget
);

// ======================================================
// CHANGEMENT DE STATUT
// PATCH /api/finance/budgets/:id/status
//
// Exemples :
// draft -> active
// active -> closed
// active -> cancelled
// ======================================================

router.patch(
  "/:id/status",
  authorizeRoles("admin", "manager"),
  changeFinanceBudgetStatus
);

// ======================================================
// SUPPRESSION
// DELETE /api/finance/budgets/:id
//
// Seul un budget encore en brouillon peut être supprimé.
// ======================================================

router.delete(
  "/:id",
  authorizeRoles("admin"),
  deleteFinanceBudget
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;