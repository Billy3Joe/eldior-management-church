/**
 * ======================================================
 * ELDIOR MANAGEMENT CHURCH
 * SCHEDULER AUTOMATIQUE DES ALERTES PASTORALES
 * ======================================================
 *
 * Règles :
 * - Exécution à 02h00, heure de Paris.
 * - Analyse uniquement le mois précédent.
 * - Aucune analyse du mois en cours.
 * - Nouvelle tentative quotidienne en cas d'échec.
 * - Verrouillage MongoDB via executePastoralScan.
 * - Isolation des données par église.
 *
 * IMPORTANT :
 * PASTORAL_SCHEDULER_ENABLED=false
 * jusqu'à la validation complète du module.
 */

const mongoose = require("mongoose");

const Church = require("../models/Church");

const {
  executePastoralScan,
} = require("../services/pastoralAlertService");

// ======================================================
// CONFIGURATION
// ======================================================

const TIMEZONE = "Europe/Paris";

const CHECK_INTERVAL_MS = 60 * 1000;

const EXECUTION_HOUR = 2;
const EXECUTION_MINUTE = 0;

// Le scheduler peut vérifier les 7 premiers jours
// du mois pour permettre les nouvelles tentatives.

const MAX_RETRY_DAY = 7;

let timer = null;
let running = false;
let lastRunKey = null;

// ======================================================
// DATE ET HEURE DE PARIS
// ======================================================

function getParisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),

    dateKey:
      `${values.year}-${values.month}-${values.day}`,

    currentPeriodKey:
      `${values.year}-${values.month}`,
  };
}

// ======================================================
// DÉTERMINER LE MOIS PRÉCÉDENT
// ======================================================

function getPreviousPeriodKey(paris) {
  let year = paris.year;
  let month = paris.month - 1;

  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return (
    `${year}-` +
    String(month).padStart(2, "0")
  );
}

// ======================================================
// VALIDATION DE LA PÉRIODE
// ======================================================

function isValidPeriodKey(periodKey) {
  return (
    typeof periodKey === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)
  );
}

function assertClosedPeriod(periodKey) {
  if (!isValidPeriodKey(periodKey)) {
    throw new Error(
      "Période invalide. Format attendu : AAAA-MM."
    );
  }

  const paris = getParisParts();

  const currentPeriod = paris.currentPeriodKey;

  if (periodKey >= currentPeriod) {
    throw new Error(
      "Impossible de générer des alertes " +
      "pour un mois en cours ou futur."
    );
  }
}

// ======================================================
// ANALYSE D'UNE ÉGLISE
// ======================================================

async function scanChurch(churchId, periodKey) {
  assertClosedPeriod(periodKey);

  if (!mongoose.Types.ObjectId.isValid(churchId)) {
    throw new Error(
      "Identifiant d'église invalide."
    );
  }

  const result = await executePastoralScan({
    churchId,
    periodKey,
    req: null,
  });

  if (result?.skipped) {
    console.log(
      `[PastoralScheduler] Analyse ignorée : ` +
      `église ${churchId}, période ${periodKey}.`
    );

    return result;
  }

  console.log(
    `[PastoralScheduler] Analyse terminée : ` +
    `église ${churchId}, période ${periodKey}.`,
    result?.data
  );

  return result;
}

// ======================================================
// ANALYSE DE TOUTES LES ÉGLISES ACTIVES
// ======================================================

async function scanAllChurches(periodKey) {
  assertClosedPeriod(periodKey);

  if (running) {
    return {
      skipped: true,
      reason: "LOCAL_SCAN_RUNNING",
    };
  }

  if (mongoose.connection.readyState !== 1) {
    console.warn(
      "[PastoralScheduler] MongoDB indisponible."
    );

    return {
      skipped: true,
      reason: "MONGODB_UNAVAILABLE",
    };
  }

  running = true;

  try {
    // Filtre conservé depuis le fichier initial.
    // À vérifier avec le schéma Church.

    const churches = await Church.find({
      status: "active",
      isActive: true,
    })
      .select("_id name")
      .lean();

    console.log(
      `[PastoralScheduler] ${churches.length} ` +
      `église(s) à analyser pour ${periodKey}.`
    );

    const summary = {
      periodKey,
      totalChurches: churches.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    for (const church of churches) {
      try {
        const result = await scanChurch(
          church._id,
          periodKey
        );

        if (result?.skipped) {
          summary.skipped += 1;
        } else {
          summary.succeeded += 1;
        }
      } catch (error) {
        summary.failed += 1;

        console.error(
          `[PastoralScheduler] Erreur église ` +
          `${church._id} :`,
          error.message
        );
      }
    }

    console.log(
      "[PastoralScheduler] Bilan mensuel :",
      summary
    );

    return summary;
  } finally {
    running = false;
  }
}// ======================================================
// VÉRIFICATION DE L'HORAIRE
// ======================================================

async function checkSchedule() {
  const paris = getParisParts();

  // Exécution uniquement à 02h00, heure de Paris.

  if (
    paris.hour !== EXECUTION_HOUR ||
    paris.minute !== EXECUTION_MINUTE
  ) {
    return;
  }

  // Les analyses sont effectuées uniquement
  // pendant les 7 premiers jours du mois.
  //
  // Exemple :
  // Du 1er au 7 décembre :
  // analyse du mois de novembre.

  if (paris.day > MAX_RETRY_DAY) {
    return;
  }

  // Empêcher deux exécutions pendant
  // la même journée sur cette instance.

  if (lastRunKey === paris.dateKey) {
    return;
  }

  if (running) {
    return;
  }

  // Le mois analysé est toujours terminé.

  const periodKey = getPreviousPeriodKey(paris);

  assertClosedPeriod(periodKey);

  lastRunKey = paris.dateKey;

  console.log(
    "[PastoralScheduler] Démarrage du contrôle " +
    `mensuel : ${periodKey}.`
  );

  try {
    const summary = await scanAllChurches(
      periodKey
    );

    if (
      summary?.skipped &&
      summary.reason === "MONGODB_UNAVAILABLE"
    ) {
      // Nouvelle tentative pendant la même minute
      // si la connexion revient.

      lastRunKey = null;
      return;
    }

    if (summary?.failed > 0) {
      console.warn(
        "[PastoralScheduler] Certaines églises " +
        "n'ont pas pu être analysées. " +
        "Nouvelle tentative le lendemain."
      );
    }

    if (summary?.skipped > 0) {
      console.log(
        "[PastoralScheduler] Certaines analyses " +
        "ont été ignorées, notamment si un " +
        "verrou MongoDB était déjà actif."
      );
    }

    console.log(
      "[PastoralScheduler] Contrôle terminé " +
      `pour la période ${periodKey}.`
    );
  } catch (error) {
    // Autoriser une nouvelle tentative pendant
    // la même minute en cas d'erreur générale.

    lastRunKey = null;

    console.error(
      "[PastoralScheduler] Erreur générale :",
      error.message
    );
  }
}

// ======================================================
// DÉMARRAGE DU SCHEDULER
// ======================================================

function startPastoralAlertScheduler() {
  // Éviter plusieurs timers sur la même instance.

  if (timer) {
    console.log(
      "[PastoralScheduler] Déjà démarré."
    );
    return;
  }

  // Activation uniquement par configuration.

  if (
    process.env.PASTORAL_SCHEDULER_ENABLED !== "true"
  ) {
    console.log(
      "[PastoralScheduler] Désactivé " +
      "par configuration."
    );
    return;
  }

  console.log(
    "[PastoralScheduler] Activé."
  );

  console.log(
    "[PastoralScheduler] Heure : " +
    "02h00 (Europe/Paris)."
  );

  console.log(
    "[PastoralScheduler] Période : " +
    "mois précédent uniquement."
  );

  console.log(
    "[PastoralScheduler] Contrôle : " +
    "du 1er au 7 de chaque mois."
  );

  // Vérification régulière de l'heure.

  timer = setInterval(() => {
    checkSchedule().catch((error) => {
      console.error(
        "[PastoralScheduler] Erreur " +
        "de planification :",
        error.message
      );
    });
  }, CHECK_INTERVAL_MS);

  // Vérification au démarrage.
  // Elle ne déclenchera un scan que si
  // toutes les conditions sont respectées.

  checkSchedule().catch((error) => {
    console.error(
      "[PastoralScheduler] Erreur au démarrage :",
      error.message
    );
  });
}

// ======================================================
// ARRÊT DU SCHEDULER
// ======================================================

function stopPastoralAlertScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  // Réinitialiser l'état de planification.
  // Un scan déjà en cours n'est pas annulé
  // automatiquement par cette fonction.

  lastRunKey = null;

  console.log(
    "[PastoralScheduler] Arrêté."
  );
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  startPastoralAlertScheduler,
  stopPastoralAlertScheduler,
  scanAllChurches,
  scanChurch,
};