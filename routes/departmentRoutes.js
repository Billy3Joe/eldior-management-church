const express =
  require("express");

const router =
  express.Router();

const {
  createDepartment,
  getDepartments,
  getDepartmentStats,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} = require(
  "../controllers/departmentController"
);

const {
  protect,
} = require(
  "../middleware/authMiddleware"
);

const requireChurch =
  require(
    "../middleware/tenantMiddleware"
  );

const authorizeRoles =
  require(
    "../middleware/roleMiddleware"
  );

// ======================================================
// TOUTES LES ROUTES SONT PROTÉGÉES
// ======================================================

router.use(
  protect,
  requireChurch
);

// ======================================================
// LISTE DES DÉPARTEMENTS
// GET /api/departments
// ======================================================

router.get(
  "/",
  getDepartments
);

// ======================================================
// STATISTIQUES
//
// IMPORTANT :
// cette route DOIT être placée
// AVANT /:id
//
// GET /api/departments/stats/all
// ======================================================

router.get(
  "/stats/all",
  getDepartmentStats
);

// ======================================================
// UN DÉPARTEMENT
// GET /api/departments/:id
// ======================================================

router.get(
  "/:id",
  getDepartmentById
);

// ======================================================
// CRÉER
// POST /api/departments
// admin + manager
// ======================================================

router.post(
  "/",
  authorizeRoles(
    "admin",
    "manager"
  ),
  createDepartment
);

// ======================================================
// MODIFIER
// PUT /api/departments/:id
// admin + manager
// ======================================================

router.put(
  "/:id",
  authorizeRoles(
    "admin",
    "manager"
  ),
  updateDepartment
);

// ======================================================
// SUPPRIMER
// DELETE /api/departments/:id
// admin uniquement
// ======================================================

router.delete(
  "/:id",
  authorizeRoles(
    "admin"
  ),
  deleteDepartment
);

module.exports = router;