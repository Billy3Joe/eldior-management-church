const express =
  require("express");

const router =
  express.Router();

const {
  getPlatformDashboard,
  getChurches,
  getChurchById,
  updateChurch,
} = require(
  "../controllers/platformController"
);

const authMiddleware =
  require(
    "../middleware/authMiddleware"
  );

const authorizePlatformRoles =
  require(
    "../middleware/platformRoleMiddleware"
  );

// Compatible avec nos deux formats d'export
const protect =
  authMiddleware.protect ||
  authMiddleware;

// ======================================================
// TOUTES LES ROUTES SONT RÉSERVÉES AU SUPERADMIN
// ======================================================

router.use(
  protect
);

router.use(
  authorizePlatformRoles(
    "superadmin"
  )
);

// ======================================================
// DASHBOARD
// ======================================================

router.get(
  "/dashboard",
  getPlatformDashboard
);

// ======================================================
// ÉGLISES
// ======================================================

router.get(
  "/churches",
  getChurches
);

router.get(
  "/churches/:id",
  getChurchById
);

router.put(
  "/churches/:id",
  updateChurch
);

module.exports =
  router;