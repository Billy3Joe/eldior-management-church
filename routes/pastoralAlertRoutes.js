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
  scanProlongedAbsences,
  getPastoralAlerts,
  getPastoralAlertStats,
  getMemberPastoralAlerts,
  getPastoralAlertById,
  updatePastoralAlert,
} = require(
  "../controllers/pastoralAlertController"
);

// ======================================================
// MIDDLEWARES
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
// ANALYSE DES ABSENCES
// ======================================================

router.post(
  "/scan",
  scanProlongedAbsences
);

// ======================================================
// STATISTIQUES
// IMPORTANT : AVANT /:id
// ======================================================

router.get(
  "/stats",
  getPastoralAlertStats
);

// ======================================================
// ALERTES D'UNE PERSONNE
// ======================================================

router.get(
  "/member/:memberId",
  getMemberPastoralAlerts
);

// ======================================================
// LISTE
// ======================================================

router.get(
  "/",
  getPastoralAlerts
);

// ======================================================
// DÉTAIL
// ======================================================

router.get(
  "/:id",
  getPastoralAlertById
);

// ======================================================
// MODIFICATION / TRAITEMENT
// ======================================================

router.put(
  "/:id",
  updatePastoralAlert
);

// ======================================================
// EXPORT
// ======================================================

module.exports =
  router;