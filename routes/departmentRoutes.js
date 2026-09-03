const express =
  require("express");

const router =
  express.Router();

const Department =
  require(
    "../models/Department"
  );

// ======================================================
// CONTROLLER
// ======================================================

const {
  createDepartment,
  getDepartments,
  getDepartmentStats,
  getMemberDepartments,
  getDepartmentById,
  updateDepartment,
  addMemberToDepartment,
  updateDepartmentMember,
  removeMemberFromDepartment,
  deleteDepartment,
} = require(
  "../controllers/departmentController"
);

// ======================================================
// AUTH
// ======================================================

const authMiddleware =
  require(
    "../middleware/authMiddleware"
  );

const protect =
  authMiddleware.protect ||
  authMiddleware;

// ======================================================
// TENANT
// ======================================================

const requireChurch =
  require(
    "../middleware/tenantMiddleware"
  );

// ======================================================
// RÔLES
// ======================================================

const authorizeRoles =
  require(
    "../middleware/roleMiddleware"
  );

// ======================================================
// ABONNEMENT
// ======================================================

const {
  requireActiveSubscription,
  requireFeature,
  enforceResourceLimit,
} = require(
  "../middleware/subscriptionMiddleware"
);

// ======================================================
// TOUTES LES ROUTES SONT PROTÉGÉES
// ======================================================

router.use(
  protect,
  requireChurch,
  requireActiveSubscription
);

// ======================================================
// STATISTIQUES
// GET /api/departments/stats/all
//
// IMPORTANT :
// doit être placé avant /:id
// ======================================================

router.get(
  "/stats/all",
  requireFeature(
    "departments"
  ),
  getDepartmentStats
);

// ======================================================
// DÉPARTEMENTS D'UNE PERSONNE
// GET /api/departments/member/:memberId
//
// IMPORTANT :
// doit être placé avant /:id
// ======================================================

router.get(
  "/member/:memberId",
  requireFeature(
    "departments"
  ),
  getMemberDepartments
);

// ======================================================
// LISTE DES DÉPARTEMENTS
// GET /api/departments
// ======================================================

router.get(
  "/",
  requireFeature(
    "departments"
  ),
  getDepartments
);

// ======================================================
// CRÉER UN DÉPARTEMENT
// POST /api/departments
//
// FREE      = 5 départements maximum
// STANDARD  = 20 départements maximum
// PREMIUM   = illimité
//
// admin + manager
// ======================================================

router.post(
  "/",
  requireFeature(
    "departments"
  ),

  authorizeRoles(
    "admin",
    "manager"
  ),

  enforceResourceLimit({
    resource:
      "departments",

    Model:
      Department,
  }),

  createDepartment
);

// ======================================================
// AJOUTER UNE PERSONNE AU DÉPARTEMENT
// POST /api/departments/:id/members
//
// admin + manager
// ======================================================

router.post(
  "/:id/members",

  requireFeature(
    "departments"
  ),

  authorizeRoles(
    "admin",
    "manager"
  ),

  addMemberToDepartment
);

// ======================================================
// MODIFIER LA RESPONSABILITÉ D'UNE PERSONNE
// PUT /api/departments/:id/members/:memberId
//
// admin + manager
// ======================================================

router.put(
  "/:id/members/:memberId",

  requireFeature(
    "departments"
  ),

  authorizeRoles(
    "admin",
    "manager"
  ),

  updateDepartmentMember
);

// ======================================================
// RETIRER UNE PERSONNE DU DÉPARTEMENT
// DELETE /api/departments/:id/members/:memberId
//
// admin + manager
// ======================================================

router.delete(
  "/:id/members/:memberId",

  requireFeature(
    "departments"
  ),

  authorizeRoles(
    "admin",
    "manager"
  ),

  removeMemberFromDepartment
);

// ======================================================
// UN DÉPARTEMENT
// GET /api/departments/:id
// ======================================================

router.get(
  "/:id",

  requireFeature(
    "departments"
  ),

  getDepartmentById
);

// ======================================================
// MODIFIER UN DÉPARTEMENT
// PUT /api/departments/:id
//
// admin + manager
// ======================================================

router.put(
  "/:id",

  requireFeature(
    "departments"
  ),

  authorizeRoles(
    "admin",
    "manager"
  ),

  updateDepartment
);

// ======================================================
// SUPPRIMER UN DÉPARTEMENT
// DELETE /api/departments/:id
//
// admin uniquement
// ======================================================

router.delete(
  "/:id",

  requireFeature(
    "departments"
  ),

  authorizeRoles(
    "admin"
  ),

  deleteDepartment
);

// ======================================================
// EXPORT
// ======================================================

module.exports =
  router;