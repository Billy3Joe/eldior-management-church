/**
 * ======================================================
 * ELDIOR MANAGEMENT CHURCH
 * SERVICE CENTRALISÉ DES ALERTES PASTORALES
 * ======================================================
 *
 * - Validation de l'église
 * - Validation de la période mensuelle
 * - Refus des mois en cours ou futurs
 * - Verrou MongoDB partagé
 * - Renouvellement périodique du verrou
 * - Détection de la perte de propriété
 * - Signal d'annulation transmis au scan
 * - Libération sécurisée
 */

const mongoose = require("mongoose");

const {
  acquireLock,
  renewLock,
  ownsLock,
  releaseLock,
} = require("./pastoralScanLockService");

// ======================================================
// CONFIGURATION
// ======================================================

const TIMEZONE = "Europe/Paris";

const RENEW_INTERVAL_MS = 5 * 60 * 1000;

// ======================================================
// UTILITAIRES
// ======================================================

function validatePeriodKey(periodKey) {
  return (
    typeof periodKey === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)
  );
}

function createHttpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ======================================================
// MOIS ACTUEL À PARIS
// ======================================================

function getCurrentParisPeriodKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}`;
}

// ======================================================
// MOIS PRÉCÉDENT À PARIS
// ======================================================

function getPreviousParisPeriodKey(date = new Date()) {
  const current = getCurrentParisPeriodKey(date);

  const [year, month] = current
    .split("-")
    .map(Number);

  const previousDate = new Date(
    Date.UTC(year, month - 2, 1)
  );

  return (
    `${previousDate.getUTCFullYear()}-` +
    String(previousDate.getUTCMonth() + 1).padStart(2, "0")
  );
}

// ======================================================
// VALIDATION D'UN MOIS CLÔTURÉ
// ======================================================

function assertClosedPeriod(periodKey) {
  if (!validatePeriodKey(periodKey)) {
    throw createHttpError(
      "Période invalide. Format attendu : AAAA-MM.",
      400
    );
  }

  const currentPeriod = getCurrentParisPeriodKey();

  if (periodKey >= currentPeriod) {
    throw createHttpError(
      "Impossible de générer des alertes pastorales " +
      "pour le mois en cours ou pour un mois futur. " +
      "L'analyse est autorisée uniquement après " +
      "la clôture du mois.",
      400
    );
  }

  return true;
}

// ======================================================
// EXÉCUTION CENTRALISÉE DU SCAN
// ======================================================

async function executePastoralScan({
  churchId,
  periodKey,
  req = null,
}) {
  // ====================================================
  // 1. VALIDATION DE L'ÉGLISE
  // ====================================================

  if (!mongoose.isValidObjectId(churchId)) {
    throw createHttpError(
      "Identifiant d'église invalide.",
      400
    );
  }

  // ====================================================
  // 2. VALIDATION DE LA PÉRIODE
  // ====================================================

  assertClosedPeriod(periodKey);

  // ====================================================
  // 3. VÉRIFICATION DE MONGODB
  // ====================================================

  if (mongoose.connection.readyState !== 1) {
    throw createHttpError(
      "Connexion MongoDB indisponible.",
      503
    );
  }

  // ====================================================
  // 4. ACQUISITION DU VERROU
  // ====================================================

  const lock = await acquireLock(
    churchId,
    periodKey
  );

  if (!lock.acquired) {
    return {
      success: false,
      skipped: true,
      reason: "SCAN_ALREADY_RUNNING",
      message:
        "Une analyse pastorale est déjà en cours " +
        "pour cette église et cette période.",
    };
  }

  let heartbeat = null;
  let scanError = null;
  let lockLost = false;
  let renewing = false;

  const abortController = new AbortController();

  // ====================================================
  // 5. DÉTECTION DE LA PERTE DU VERROU
  // ====================================================

  function markLockLost(reason) {
    if (lockLost) return;

    lockLost = true;

    console.error(
      `[PastoralScan] Verrou perdu : ` +
      `église ${churchId}, période ${periodKey}. ` +
      reason
    );

    abortController.abort(
      createHttpError(
        "Le verrou pastoral a été perdu.",
        503
      )
    );
  }

  // ====================================================
  // 6. VÉRIFICATION DE PROPRIÉTÉ
  // ====================================================

  async function assertLockOwnership() {
    if (abortController.signal.aborted) {
      throw createHttpError(
        "Analyse pastorale interrompue : " +
        "verrou perdu.",
        503
      );
    }

    let valid;

    try {
      valid = await ownsLock(
        churchId,
        periodKey,
        lock.owner
      );
    } catch (error) {
      markLockLost(
        `Vérification impossible : ${error.message}`
      );

      throw createHttpError(
        "Impossible de vérifier le verrou pastoral.",
        503
      );
    }

    if (!valid) {
      markLockLost(
        "Propriétaire du verrou non reconnu."
      );

      throw createHttpError(
        "Analyse pastorale interrompue : " +
        "verrou perdu.",
        503
      );
    }
  }  // ====================================================
  // 7. RENOUVELLEMENT DU VERROU
  // ====================================================

  async function renewHeartbeat() {
    if (renewing || lockLost) {
      return;
    }

    renewing = true;

    try {
      const renewed = await renewLock(
        churchId,
        periodKey,
        lock.owner
      );

      if (!renewed) {
        markLockLost(
          "Échec du renouvellement du verrou."
        );
      }
    } catch (error) {
      markLockLost(
        `Erreur de renouvellement : ${error.message}`
      );
    } finally {
      renewing = false;
    }
  }

  // ====================================================
  // 8. EXÉCUTION DE L'ANALYSE
  // ====================================================

  try {
    // Charger la fonction métier du contrôleur.

    const {
      scanMonthlyAbsences,
    } = require(
      "../controllers/pastoralAlertController"
    );

    if (typeof scanMonthlyAbsences !== "function") {
      throw createHttpError(
        "La fonction scanMonthlyAbsences " +
        "est introuvable.",
        500
      );
    }

    // ==================================================
    // 9. DÉMARRER LE RENOUVELLEMENT
    // ==================================================

    heartbeat = setInterval(() => {
      void renewHeartbeat();
    }, RENEW_INTERVAL_MS);

    // ==================================================
    // 10. VÉRIFIER LE VERROU AVANT L'ANALYSE
    // ==================================================

    await assertLockOwnership();

    // Revérifier que le mois est clôturé.
    // Cette protection est utile si l'exécution
    // intervient à proximité d'un changement de mois.

    assertClosedPeriod(periodKey);

    // ==================================================
    // 11. EXÉCUTER L'ANALYSE MENSUELLE
    // ==================================================

    const data = await scanMonthlyAbsences({
      churchId,
      periodKey,
      req,
      signal: abortController.signal,
      assertLockOwnership,
    });

    // ==================================================
    // 12. VÉRIFICATION FINALE
    // ==================================================

    await assertLockOwnership();

    return {
      success: true,
      skipped: false,
      message:
        "Analyse mensuelle des absences terminée.",
      data,
    };
  } catch (error) {
    scanError = error;

    console.error(
      `[PastoralScan] Échec de l'analyse ` +
      `${periodKey} pour l'église ${churchId} :`,
      error.message
    );

    throw error;
  } finally {
    // ==================================================
    // 13. ARRÊTER LE RENOUVELLEMENT
    // ==================================================

    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    // ==================================================
    // 14. ATTENDRE UN RENOUVELLEMENT EN COURS
    // ==================================================

    while (renewing) {
      await new Promise((resolve) =>
        setTimeout(resolve, 25)
      );
    }

    // ==================================================
    // 15. LIBÉRER UNIQUEMENT NOTRE VERROU
    // ==================================================

    try {
      await releaseLock({
        churchId,
        periodKey,
        owner: lock.owner,
        error: scanError,
      });
    } catch (releaseError) {
      console.error(
        "[PastoralScan] Erreur de libération :",
        releaseError.message
      );
    }
  }
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  executePastoralScan,
  validatePeriodKey,
  assertClosedPeriod,
  getCurrentParisPeriodKey,
  getPreviousParisPeriodKey,
};