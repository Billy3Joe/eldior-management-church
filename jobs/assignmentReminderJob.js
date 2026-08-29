const cron = require("node-cron");

const ChurchSettings = require(
  "../models/ChurchSettings"
);

const {
  processChurchReminders,
} = require(
  "../services/assignmentReminderService"
);

// Évite plusieurs exécutions dans la même journée.
// Structure :
// {
//   churchId: "2026-08-25"
// }
const lastExecutions =
  new Map();

// ======================================================
// RÉCUPÉRER HEURE LOCALE
// ======================================================

const getLocalTime = (
  timezone
) => {
  const formatter =
    new Intl.DateTimeFormat(
      "fr-FR",
      {
        timeZone:
          timezone,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false,
      }
    );

  const parts =
    formatter.formatToParts(
      new Date()
    );

  const getPart = (
    type
  ) =>
    parts.find(
      (part) =>
        part.type ===
        type
    )?.value;

  return {
    year:
      getPart("year"),

    month:
      getPart("month"),

    day:
      getPart("day"),

    hour:
      Number(
        getPart("hour")
      ),

    minute:
      Number(
        getPart("minute")
      ),
  };
};

// ======================================================
// VÉRIFICATION DES ÉGLISES
// ======================================================

const checkChurchSchedulers =
  async () => {
    try {
      const settingsList =
        await ChurchSettings.find({
          church: {
            $ne: null,
          },

          reminderEnabled:
            true,
        });

      for (
        const settings of
        settingsList
      ) {
        const churchId =
          settings.church.toString();

        const timezone =
          settings.timezone ||
          "Europe/Paris";

        const reminderHour =
          Number(
            settings.reminderHour ??
              9
          );

        const local =
          getLocalTime(
            timezone
          );

        const currentDate =
          `${local.year}-${local.month}-${local.day}`;

        // Pas encore l'heure
        if (
          local.hour !==
          reminderHour
        ) {
          continue;
        }

        // Déjà exécuté aujourd'hui
        if (
          lastExecutions.get(
            churchId
          ) ===
          currentDate
        ) {
          continue;
        }

        console.log(
          `⏰ Rappels de l'église ${churchId} à ${String(
            reminderHour
          ).padStart(
            2,
            "0"
          )}:00 (${timezone})`
        );

        await processChurchReminders(
          churchId
        );

        lastExecutions.set(
          churchId,
          currentDate
        );
      }
    } catch (error) {
      console.error(
        "❌ Erreur scheduler multi-églises :",
        error.message
      );
    }
  };

// ======================================================
// DÉMARRAGE
// ======================================================

const startAssignmentReminderJob =
  () => {
    console.log(
      "🔔 Scheduler multi-églises activé"
    );

    // Vérification au démarrage.
    // Ici, on vérifie seulement si une église
    // doit réellement être exécutée maintenant.
    checkChurchSchedulers();

    // Toutes les 10 minutes.
    // Cela permet de respecter les fuseaux horaires
    // et les changements de Settings.
    cron.schedule(
      "*/10 * * * *",
      async () => {
        await checkChurchSchedulers();
      }
    );

    console.log(
      "🕘 Vérification des horaires toutes les 10 minutes"
    );
  };

module.exports =
  startAssignmentReminderJob;