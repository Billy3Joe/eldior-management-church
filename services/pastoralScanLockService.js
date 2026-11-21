
/**
 * ======================================================
 * ELDIOR MANAGEMENT CHURCH
 * SERVICE DE VERROUILLAGE DES SCANS PASTORAUX
 * ======================================================
 *
 * Un verrou par église et par période (AAAA-MM).
 * Compatible avec les scans manuels et automatiques.
 *
 * Nécessite un index MongoDB unique :
 * { church: 1, periodKey: 1 }
 */

const crypto = require("node:crypto");

const PastoralScanLock = require(
  "../models/PastoralScanLock"
);

const LOCK_DURATION_MS = 30 * 60 * 1000;

const validatePeriodKey = (periodKey) =>
  typeof periodKey === "string" &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey);

// ======================================================
// ACQUISITION DU VERROU
// ======================================================

async function acquireLock(churchId, periodKey) {
  if (!churchId || !validatePeriodKey(periodKey)) {
    throw new Error(
      "Église ou période invalide pour le verrou pastoral."
    );
  }

  const now = new Date();
  const owner = crypto.randomUUID();

  const lockedUntil = new Date(
    now.getTime() + LOCK_DURATION_MS
  );

  // 1. Réutiliser uniquement un verrou expiré.
  const existing = await PastoralScanLock.findOneAndUpdate(
    {
      church: churchId,
      periodKey,
      lockedUntil: { $lte: now },
    },
    {
      $set: {
        owner,
        lockedUntil,
        acquiredAt: now,
        lastError: null,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (existing) {
    return {
      acquired: true,
      owner,
      lockedUntil,
    };
  }

  // 2. Créer le verrou lors du premier scan.
  try {
    await PastoralScanLock.create({
      church: churchId,
      periodKey,
      owner,
      lockedUntil,
      acquiredAt: now,
      lastError: null,
    });

    return {
      acquired: true,
      owner,
      lockedUntil,
    };
  } catch (error) {
    // L'index unique empêche deux créations simultanées.
    if (error.code === 11000) {
      return {
        acquired: false,
        owner: null,
        reason: "SCAN_ALREADY_RUNNING",
      };
    }

    throw error;
  }
}

// ======================================================
// RENOUVELLEMENT DU VERROU
// ======================================================

async function renewLock(churchId, periodKey, owner) {
  if (!owner) return false;

  const now = new Date();

  const result = await PastoralScanLock.updateOne(
    {
      church: churchId,
      periodKey,
      owner,
      lockedUntil: { $gt: now },
    },
    {
      $set: {
        lockedUntil: new Date(
          now.getTime() + LOCK_DURATION_MS
        ),
      },
    }
  );

  return result.matchedCount === 1;
}

// ======================================================
// VÉRIFICATION DU PROPRIÉTAIRE
// ======================================================

async function ownsLock(churchId, periodKey, owner) {
  if (!owner) return false;

  const lock = await PastoralScanLock.exists({
    church: churchId,
    periodKey,
    owner,
    lockedUntil: { $gt: new Date() },
  });

  return Boolean(lock);
}

// ======================================================
// LIBÉRATION DU VERROU
// ======================================================

async function releaseLock({
  churchId,
  periodKey,
  owner,
  error = null,
}) {
  if (!owner) return false;

  const now = new Date();

  const result = await PastoralScanLock.updateOne(
    {
      church: churchId,
      periodKey,
      owner,
    },
    {
      $set: {
        lockedUntil: now,
        lastCompletedAt: error ? null : now,
        lastError: error
          ? String(error.message || error).slice(0, 1000)
          : null,
      },
    }
  );

  return result.matchedCount === 1;
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  acquireLock,
  renewLock,
  ownsLock,
  releaseLock,
  LOCK_DURATION_MS,
};
