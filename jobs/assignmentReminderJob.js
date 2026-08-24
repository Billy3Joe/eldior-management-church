const cron = require("node-cron");

const ChurchSettings = require("../models/ChurchSettings");

const {
  processAssignmentReminders,
} = require("../services/assignmentReminderService");

// Garde en mémoire le dernier jour exécuté
let lastExecutionDate = null;

const startAssignmentReminderJob = () => {
  console.log(
    "🔔 Scheduler rappels programmations activé"
  );

  // Vérification immédiate au démarrage
  processAssignmentReminders();

  // Vérification toutes les heures
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        let settings =
          await ChurchSettings.findOne();

        if (!settings) {
          settings =
            await ChurchSettings.create({});
        }

        if (!settings.reminderEnabled) {
          console.log(
            "🔕 Rappels automatiques désactivés"
          );

          return;
        }

        const timezone =
          settings.timezone ||
          "Europe/Paris";

        const reminderHour =
          Number(
            settings.reminderHour ?? 9
          );

        // Heure locale correspondant au fuseau configuré
        const nowParts =
          new Intl.DateTimeFormat(
            "fr-FR",
            {
              timeZone: timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              hour12: false,
            }
          ).formatToParts(
            new Date()
          );

        const getPart = (type) =>
          nowParts.find(
            (part) =>
              part.type === type
          )?.value;

        const currentHour =
          Number(
            getPart("hour")
          );

        const currentDate =
          `${getPart("year")}-${getPart("month")}-${getPart("day")}`;

        console.log(
          `🕒 Scheduler : ${currentDate} ${String(
            currentHour
          ).padStart(
            2,
            "0"
          )}:00 (${timezone})`
        );

        // Ce n'est pas encore l'heure configurée
        if (
          currentHour !==
          reminderHour
        ) {
          return;
        }

        // Déjà exécuté aujourd'hui
        if (
          lastExecutionDate ===
          currentDate
        ) {
          console.log(
            "ℹ️ Rappels déjà vérifiés aujourd'hui"
          );

          return;
        }

        console.log(
          "⏰ Heure configurée atteinte : lancement des rappels"
        );

        await processAssignmentReminders();

        lastExecutionDate =
          currentDate;
      } catch (error) {
        console.error(
          "❌ Erreur scheduler rappels :",
          error.message
        );
      }
    },
    {
      timezone: "UTC",
    }
  );

  console.log(
    "🕘 Scheduler dynamique actif : vérification toutes les heures"
  );
};

module.exports =
  startAssignmentReminderJob;