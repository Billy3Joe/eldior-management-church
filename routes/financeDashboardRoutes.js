const express = require("express");

const protect = require("../middleware/authMiddleware");
const requireChurch = require("../middleware/tenantMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  getFinanceDashboard,
} = require("../controllers/financeDashboardController");

const router = express.Router();

// ======================================================
// MIDDLEWARES GLOBAUX
// ======================================================

router.use(protect, requireChurch);

// ======================================================
// TABLEAU DE BORD FINANCIER
// Admin + Manager
// ======================================================

router.get(
  "/",
  authorizeRoles("admin", "manager"),
  getFinanceDashboard
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;