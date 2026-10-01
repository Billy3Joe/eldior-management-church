const express = require("express");

const router = express.Router();

const {
  getFinanceCategories,
  getFinanceCategoryById,
  createFinanceCategory,
  updateFinanceCategory,
  toggleFinanceCategoryStatus,
  deleteFinanceCategory,
  getFinanceCategoryStats,
} = require("../controllers/financeCategoryController");

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
// ======================================================

router.get(
  "/stats/summary",
  authorizeRoles("admin", "manager"),
  getFinanceCategoryStats
);

// ======================================================
// LISTE
// ======================================================

router.get(
  "/",
  authorizeRoles("admin", "manager"),
  getFinanceCategories
);

// ======================================================
// DÉTAIL
// ======================================================

router.get(
  "/:id",
  authorizeRoles("admin", "manager"),
  getFinanceCategoryById
);

// ======================================================
// CRÉATION
// ======================================================

router.post(
  "/",
  authorizeRoles("admin", "manager"),
  createFinanceCategory
);

// ======================================================
// MODIFICATION
// ======================================================

router.put(
  "/:id",
  authorizeRoles("admin", "manager"),
  updateFinanceCategory
);

// ======================================================
// ACTIVER / DÉSACTIVER
// ======================================================

router.patch(
  "/:id/status",
  authorizeRoles("admin", "manager"),
  toggleFinanceCategoryStatus
);

// ======================================================
// SUPPRESSION
// ======================================================

router.delete(
  "/:id",
  authorizeRoles("admin"),
  deleteFinanceCategory
);

module.exports = router;