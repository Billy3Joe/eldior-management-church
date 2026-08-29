const express = require("express");

const router = express.Router();

const protect = require(
  "../middleware/authMiddleware"
);

const requireChurch = require(
  "../middleware/tenantMiddleware"
);

const {
  getSettings,
  updateSettings,
} = require(
  "../controllers/settingsController"
);

// ======================================================
// ADMIN UNIQUEMENT
// ======================================================

const adminOnly = (
  req,
  res,
  next
) => {
  if (
    req.user?.role !==
    "admin"
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Accès réservé aux administrateurs",
    });
  }

  next();
};

// ======================================================
// LIRE LES PARAMÈTRES
// ADMIN + MANAGER
// ======================================================

router.get(
  "/",
  protect,
  requireChurch,
  getSettings
);

// ======================================================
// MODIFIER LES PARAMÈTRES
// ADMIN UNIQUEMENT
// ======================================================

router.put(
  "/",
  protect,
  requireChurch,
  adminOnly,
  updateSettings
);

module.exports = router;