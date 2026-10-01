const express =
  require("express");

const router =
  express.Router();

const {
  previewPersonHistoryBackfill,
  executePersonHistoryBackfill,
  getPersonHistoryBackfillInfo,
} = require(
  "../controllers/personHistoryBackfillController"
);

const authMiddleware =
  require(
    "../middleware/authMiddleware"
  );

const protect =
  authMiddleware.protect ||
  authMiddleware;

const requireChurch =
  require(
    "../middleware/tenantMiddleware"
  );

const authorizeRoles =
  require(
    "../middleware/roleMiddleware"
  );

// ======================================================
// PROTECTION GLOBALE
// ======================================================

router.use(
  protect,
  requireChurch
);

// ======================================================
// INFO BACKFILL
// ======================================================

router.get(
  "/info",
  authorizeRoles(
    "admin",
    "manager"
  ),
  getPersonHistoryBackfillInfo
);

// ======================================================
// PRÉVISUALISATION — AUCUNE ÉCRITURE
// ======================================================

router.post(
  "/preview",
  authorizeRoles(
    "admin",
    "manager"
  ),
  previewPersonHistoryBackfill
);

// ======================================================
// EXÉCUTION RÉELLE — PROTÉGÉE PAR CONFIRMATION
// ======================================================

router.post(
  "/run",
  authorizeRoles(
    "admin",
    "manager"
  ),
  executePersonHistoryBackfill
);

// ======================================================
// EXPORT
// ======================================================

module.exports =
  router;