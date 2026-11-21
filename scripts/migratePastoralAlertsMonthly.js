
require("dotenv").config();

const mongoose = require("mongoose");

// ======================================================
// CONFIGURATION
// ======================================================

const COLLECTION = "pastoralalerts";

const OLD_INDEX =
  "unique_church_member_pastoral_alert_type";

const NEW_INDEX =
  "unique_monthly_pastoral_alert";

const APPLY = process.argv.includes("--apply");

const URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;

const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

// ======================================================
// HELPERS
// ======================================================

function getPeriodKey(dateValue) {
  if (!dateValue) return null;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // Même convention UTC que le contrôleur.
  return date.toISOString().slice(0, 7);
}

function getLegacyPeriod(alert) {
  return getPeriodKey(
    alert.detectedAt ||
    alert.createdAt
  );
}

function makeError(message) {
  return new Error(`[Migration] ${message}`);
}

// ======================================================
// CONNEXION
// ======================================================

async function connect() {
  if (!URI) {
    throw makeError(
      "MONGO_URI ou MONGODB_URI manquant dans .env"
    );
  }

  await mongoose.connect(URI, {
    autoIndex: false,
  });

  console.log("Connexion MongoDB établie.");
}

// ======================================================
// ANALYSE DES DOCUMENTS
// ======================================================

async function inspectDocuments(collection) {
  const alerts = await collection
    .find(
      {},
      {
        projection: {
          _id: 1,
          church: 1,
          member: 1,
          type: 1,
          periodKey: 1,
          detectedAt: 1,
          createdAt: 1,
        },
      }
    )
    .toArray();

  const updates = [];
  const invalid = [];
  const uniqueKeys = new Set();
  const duplicates = [];

  for (const alert of alerts) {
    if (
      !alert.church ||
      !alert.member ||
      !alert.type
    ) {
      invalid.push({
        id: String(alert._id),
        reason: "church, member ou type manquant",
      });
      continue;
    }

    let periodKey = alert.periodKey;

    if (!PERIOD_REGEX.test(periodKey || "")) {
      periodKey = getLegacyPeriod(alert);
    }

    if (!periodKey) {
      invalid.push({
        id: String(alert._id),
        reason: "Période impossible à déterminer",
      });
      continue;
    }

    const key = [
      String(alert.church),
      String(alert.member),
      alert.type,
      periodKey,
    ].join("|");

    if (uniqueKeys.has(key)) {
      duplicates.push({
        id: String(alert._id),
        key,
      });
    }

    uniqueKeys.add(key);

    updates.push({
      id: alert._id,
      periodKey,
    });
  }

  return {
    total: alerts.length,
    updates,
    invalid,
    duplicates,
  };
}

// ======================================================
// MIGRATION DES CHAMPS
// ======================================================

async function migrateDocuments(collection, updates) {
  const BATCH_SIZE = 500;
  let processed = 0;

  for (
    let offset = 0;
    offset < updates.length;
    offset += BATCH_SIZE
  ) {
    const batch = updates.slice(
      offset,
      offset + BATCH_SIZE
    );

    const operations = batch.map((item) => ({
      updateOne: {
        filter: {
          _id: item.id,
        },
        update: {
          $set: {
            periodKey: item.periodKey,
          },
          $setOnInsert: {},
        },
        upsert: false,
      },
    }));

    // Ne pas utiliser $setOnInsert ici :
    // les documents existent déjà.
    for (const operation of operations) {
      delete operation.updateOne.update.$setOnInsert;
    }

    await collection.bulkWrite(
      operations,
      { ordered: true }
    );

    processed += batch.length;
    console.log(
      `Périodes migrées : ${processed}/${updates.length}`
    );
  }

  // Les anciens compteurs consécutifs ne
  // constituent pas une preuve d'absences
  // explicites sur le mois.
  //
  // On initialise les nouveaux champs
  // sans reconstruire de fausses absences.

  await collection.updateMany(
    {
      absenceCount: { $exists: false },
    },
    {
      $set: {
        absenceCount: 0,
      },
    }
  );

  await collection.updateMany(
    {
      missedServiceIds: { $exists: false },
    },
    {
      $set: {
        missedServiceIds: [],
      },
    }
  );

  await collection.updateMany(
    {
      detectionRevision: { $exists: false },
    },
    {
      $set: {
        detectionRevision: 0,
      },
    }
  );
}

// ======================================================
// MIGRATION DES INDEX
// ======================================================

async function migrateIndexes(collection) {
  const before = await collection.indexes();

  const newIndexExists = before.some(
    (index) => index.name === NEW_INDEX
  );

  if (!newIndexExists) {
    console.log("Création du nouvel index mensuel...");

    await collection.createIndex(
      {
        church: 1,
        member: 1,
        type: 1,
        periodKey: 1,
      },
      {
        unique: true,
        name: NEW_INDEX,
      }
    );
  }

  // L'ancien index n'est supprimé
  // qu'après création réussie du nouveau.

  const afterCreation = await collection.indexes();

  const newIndexReady = afterCreation.some(
    (index) =>
      index.name === NEW_INDEX &&
      index.unique === true &&
      JSON.stringify(index.key) ===
        JSON.stringify({
          church: 1,
          member: 1,
          type: 1,
          periodKey: 1,
        })
  );

  if (!newIndexReady) {
    throw makeError(
      "Le nouvel index unique n'a pas été vérifié."
    );
  }

  const oldIndexExists = afterCreation.some(
    (index) => index.name === OLD_INDEX
  );

  if (oldIndexExists) {
    console.log("Suppression de l'ancien index...");

    await collection.dropIndex(OLD_INDEX);
  }

  console.log("Migration des index terminée.");
}

// ======================================================
// VÉRIFICATIONS FINALES
// ======================================================

async function verify(collection) {
  const missingPeriods =
    await collection.countDocuments({
      $or: [
        { periodKey: { $exists: false } },
        { periodKey: null },
        { periodKey: "" },
      ],
    });

  const indexes = await collection.indexes();

  const hasNewIndex = indexes.some(
    (index) =>
      index.name === NEW_INDEX &&
      index.unique === true
  );

  const hasOldIndex = indexes.some(
    (index) => index.name === OLD_INDEX
  );

  return {
    missingPeriods,
    hasNewIndex,
    hasOldIndex,
    success:
      missingPeriods === 0 &&
      hasNewIndex &&
      !hasOldIndex,
  };
}

// ======================================================
// EXÉCUTION
// ======================================================

async function main() {
  console.log(
    APPLY
      ? "MODE APPLICATION"
      : "MODE SIMULATION"
  );

  await connect();

  const collection =
    mongoose.connection.db.collection(COLLECTION);

  const report = await inspectDocuments(collection);

  console.log("Analyse :", {
    totalAlerts: report.total,
    documentsToCheck: report.updates.length,
    invalidDocuments: report.invalid.length,
    duplicateMonthlyKeys: report.duplicates.length,
  });

  if (report.invalid.length) {
    console.error(
      "Documents invalides :",
      report.invalid
    );
  }

  if (report.duplicates.length) {
    console.error(
      "Doublons mensuels :",
      report.duplicates
    );
  }

  if (
    report.invalid.length ||
    report.duplicates.length
  ) {
    throw makeError(
      "Migration interrompue : corriger les anomalies avant de continuer."
    );
  }

  if (!APPLY) {
    console.log(
      "Simulation terminée. Aucune modification effectuée."
    );

    console.log(
      "Après sauvegarde et arrêt des écritures, " +
      "utilise --apply pour exécuter la migration."
    );

    return;
  }

  await migrateDocuments(
    collection,
    report.updates
  );

  await migrateIndexes(collection);

  const verification = await verify(collection);

  console.log(
    "Vérification finale :",
    verification
  );

  if (!verification.success) {
    throw makeError(
      "La vérification finale a échoué."
    );
  }

  console.log(
    "Migration mensuelle terminée avec succès."
  );
}

// ======================================================
// POINT D'ENTRÉE
// ======================================================

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
