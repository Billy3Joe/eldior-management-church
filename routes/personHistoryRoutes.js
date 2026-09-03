const express =
  require("express");

const router =
  express.Router();

// ======================================================
// CONTROLLER
// ======================================================

const {
  getMemberHistory,
  addMemberHistoryNote,
} = require(
  "../controllers/personHistoryController"
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
// TOUTES LES ROUTES SONT PROTÉGÉES
// ======================================================

router.use(
  protect,
  requireChurch
);

// ======================================================
// HISTORIQUE COMPLET D'UNE PERSONNE
//
// GET /api/person-history/member/:memberId
//
// Accessible aux utilisateurs authentifiés
// de l'église.
// ======================================================

router.get(
  "/member/:memberId",
  getMemberHistory
);

// ======================================================
// AJOUTER UNE NOTE MANUELLE
//
// POST /api/person-history/member/:memberId/note
//
// Seuls admin et manager peuvent écrire
// directement dans l'historique.
// ======================================================

router.post(
  "/member/:memberId/note",
  authorizeRoles(
    "admin",
    "manager"
  ),
  addMemberHistoryNote
);

// ======================================================
// EXPORT
// ======================================================

module.exports =
  router;