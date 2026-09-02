const express =
  require("express");

const router =
  express.Router();

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
} = require(
  "../middleware/subscriptionMiddleware"
);

// ======================================================
// CONTROLLER
// ======================================================

const {
  createFamily,
  getFamilies,
  getFamilyStats,
  getFamilyByMember,
  getFamilyById,
  updateFamily,
  addFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  deleteFamily,
} = require(
  "../controllers/familyController"
);

// ======================================================
// MIDDLEWARES COMMUNS
// ======================================================

router.use(
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles(
    "admin",
    "manager"
  )
);

// ======================================================
// LISTE
// ======================================================

router.get(
  "/",
  getFamilies
);

// ======================================================
// STATISTIQUES
// IMPORTANT : avant /:id
// ======================================================

router.get(
  "/stats",
  getFamilyStats
);

// ======================================================
// FAMILLE D'UNE PERSONNE
// IMPORTANT : avant /:id
// ======================================================

router.get(
  "/member/:memberId",
  getFamilyByMember
);

// ======================================================
// CRÉATION
// ======================================================

router.post(
  "/",
  createFamily
);

// ======================================================
// DÉTAIL
// ======================================================

router.get(
  "/:id",
  getFamilyById
);

// ======================================================
// MODIFICATION
// ======================================================

router.put(
  "/:id",
  updateFamily
);

// ======================================================
// AJOUT D'UNE PERSONNE
// ======================================================

router.post(
  "/:id/members",
  addFamilyMember
);

// ======================================================
// MODIFICATION DU RÔLE FAMILIAL
// ======================================================

router.put(
  "/:id/members/:memberId",
  updateFamilyMember
);

// ======================================================
// RETRAIT D'UNE PERSONNE
// ======================================================

router.delete(
  "/:id/members/:memberId",
  removeFamilyMember
);

// ======================================================
// SUPPRESSION FAMILLE
// ADMIN UNIQUEMENT
// ======================================================

router.delete(
  "/:id",
  authorizeRoles("admin"),
  deleteFamily
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;