
const express = require("express");

const router = express.Router();

// ======================================================
// AUTHENTIFICATION
// ======================================================

const authMiddleware = require(
  "../middleware/authMiddleware"
);

const protect =
  authMiddleware.protect || authMiddleware;

// ======================================================
// MULTITENANT / ÉGLISE
// ======================================================

const requireChurch = require(
  "../middleware/tenantMiddleware"
);

// ======================================================
// CONTRÔLE DES RÔLES
// ======================================================

const authorizeRoles = require(
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
// CONTRÔLEUR DES ALERTES PASTORALES
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
// VÉRIFICATION DES HANDLERS
// ======================================================

// Permet d'identifier immédiatement une fonction
// manquante dans le contrôleur au démarrage.

const handlers = {
  scanProlongedAbsences,
  getPastoralAlerts,
  getPastoralAlertStats,
  getMemberPastoralAlerts,
  getPastoralAlertById,
  updatePastoralAlert,
};

for (const [name, handler] of Object.entries(handlers)) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `PastoralAlert : le handler "${name}" est introuvable.`
    );
  }
}

// ======================================================
// MIDDLEWARES GLOBAUX
// ======================================================

// Toutes les routes nécessitent :
// - un utilisateur authentifié
// - une église identifiée
// - un abonnement actif
// - un rôle admin ou manager

router.use(
  protect,
  requireChurch,
  requireActiveSubscription,
  authorizeRoles("admin", "manager")
);

// ======================================================
// POST /api/pastoral-alerts/scan
// ======================================================

// Lance une analyse mensuelle des absences.
//
// Exemple de body :
// {
//   "periodKey": "2026-11"
// }
//
// Seuls les cultes dominicaux terminés et
// clôturés sont pris en compte.
//
// Le contrôleur ignore :
// - les membres non pointés
// - les membres excusés
// - les présences
// - les retards

router.post(
  "/scan",
  scanProlongedAbsences
);

// ======================================================
// GET /api/pastoral-alerts/stats
// ======================================================

// Exemple :
// GET /api/pastoral-alerts/stats?periodKey=2026-11

router.get(
  "/stats",
  getPastoralAlertStats
);

// ======================================================
// GET /api/pastoral-alerts/member/:memberId
// ======================================================

// Historique pastoral d'un membre.

router.get(
  "/member/:memberId",
  getMemberPastoralAlerts
);

// ======================================================
// GET /api/pastoral-alerts
// ======================================================

// Filtres disponibles :
// - status
// - level
// - assignedTo
// - search
// - periodKey

router.get(
  "/",
  getPastoralAlerts
);

// ======================================================
// GET /api/pastoral-alerts/:id
// ======================================================

// Détail d'une alerte pastorale.

router.get(
  "/:id",
  getPastoralAlertById
);

// ======================================================
// PUT /api/pastoral-alerts/:id
// ======================================================

// Permet :
// - l'attribution à un responsable
// - la modification du statut
// - l'ajout de notes
// - l'enregistrement d'un contact
// - la résolution manuelle

router.put(
  "/:id",
  updatePastoralAlert
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;
