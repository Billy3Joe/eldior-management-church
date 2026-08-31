const cron = require("node-cron");

const ChurchSettings = require(
  "../models/ChurchSettings"
);

const Church = require(
  "../models/Church"
);

const {
  getPlanConfig,
} = require(
  "../config/planLimits"
);

const {
  processChurchReminders,
} = require(
  "../services/assignmentReminderService"
);

// ======================================================
// MÉMOIRE DES DERNIÈRES EXÉCUTIONS
//
// Structure :
// churchId => "2026-08-30"
// ======================================================

const lastExecutions =
  new Map();

// ======================================================
// ÉVITER LES EXÉCUTIONS PARALLÈLES
// ======================================================

let isChecking = false;

// ======================================================
// RÉCUPÉRER L'HEURE LOCALE
// ======================================================

const getLocalTime = (
  timezone
) => {
  try {
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
  } catch (error) {
    console.error(
      `❌ Fuseau horaire invalide : ${timezone}`,
      error.message
    );

    return null;
  }
};

// ======================================================
// VÉRIFIER SI LES RAPPELS SONT AUTORISÉS
// PAR LE PLAN
// ======================================================

const churchCanUseReminders = (
  church
) => {
  if (!church) {
    return false;
  }

  const plan =
    String(
      church.plan ||
        "free"
    ).toLowerCase();

  const config =
    getPlanConfig(plan);

  return (
    config?.features
      ?.reminders ===
    true
  );
};

// ======================================================
// VÉRIFICATION DES ÉGLISES
// ======================================================

const checkChurchSchedulers =
  async () => {
    if (isChecking) {
      console.log(
        "⏳ Vérification des rappels déjà en cours"
      );

      return;
    }

    isChecking = true;

    try {
      // ==================================================
      // UNIQUEMENT SETTINGS AVEC RAPPELS ACTIVÉS
      // ==================================================

      const settingsList =
        await ChurchSettings.find({
          church: {
            $ne: null,
          },

          reminderEnabled:
            true,
        }).populate(
          "church"
        );

      // ==================================================
      // PARCOURIR LES ÉGLISES
      // ==================================================

      for (
        const settings of
        settingsList
      ) {
        try {
          const church =
            settings.church;

          // ==================================================
          // ÉGLISE EXISTANTE
          // ==================================================

          if (!church) {
            continue;
          }

          const churchId =
            church._id.toString();

          // ==================================================
          // ÉGLISE ACTIVE
          // ==================================================

          if (
            church.isActive ===
            false
          ) {
            continue;
          }

          // ==================================================
          // ABONNEMENT ACTIF
          // ==================================================

          const status =
            church.status ||
            "active";

          if (
            status !==
            "active"
          ) {
            continue;
          }

          // ==================================================
          // PLAN AUTORISÉ
          //
          // FREE      -> NON
          // STANDARD  -> NON
          // PREMIUM   -> OUI
          // ==================================================

          if (
            !churchCanUseReminders(
              church
            )
          ) {
            // ==================================================
            // NETTOYAGE AUTOMATIQUE
            //
            // Si une ancienne église Free/Standard
            // avait encore reminderEnabled=true,
            // on le désactive.
            // ==================================================

            settings.reminderEnabled =
              false;

            await settings.save();

            console.log(
              `🔒 Rappels désactivés pour l'église ${churchId} : plan ${church.plan || "free"}`
            );

            continue;
          }

          // ==================================================
          // FUSEAU HORAIRE
          // ==================================================

          const timezone =
            settings.timezone ||
            "Europe/Paris";

          const local =
            getLocalTime(
              timezone
            );

          if (!local) {
            continue;
          }

          // ==================================================
          // HEURE DE RAPPEL
          // ==================================================

          const reminderHour =
            Number(
              settings.reminderHour ??
                9
            );

          if (
            Number.isNaN(
              reminderHour
            ) ||
            reminderHour < 0 ||
            reminderHour > 23
          ) {
            console.warn(
              `⚠️ Heure de rappel invalide pour l'église ${churchId}`
            );

            continue;
          }

          // ==================================================
          // DATE LOCALE
          // ==================================================

          const currentDate =
            `${local.year}-${local.month}-${local.day}`;

          // ==================================================
          // PAS ENCORE L'HEURE
          // ==================================================

          if (
            local.hour !==
            reminderHour
          ) {
            continue;
          }

          // ==================================================
          // DÉJÀ EXÉCUTÉ AUJOURD'HUI
          // ==================================================

          if (
            lastExecutions.get(
              churchId
            ) ===
            currentDate
          ) {
            continue;
          }

          // ==================================================
          // EXÉCUTION
          // ==================================================

          console.log(
            `⏰ Rappels de l'église ${church.name} (${churchId}) à ${String(
              reminderHour
            ).padStart(
              2,
              "0"
            )}:00 (${timezone})`
          );

          await processChurchReminders(
            churchId
          );

          // ==================================================
          // MARQUER COMME EXÉCUTÉ
          // ==================================================

          lastExecutions.set(
            churchId,
            currentDate
          );

          console.log(
            `✅ Rappels traités pour ${church.name}`
          );
        } catch (churchError) {
          console.error(
            "❌ Erreur traitement rappel d'une église :",
            churchError
          );
        }
      }
    } catch (error) {
      console.error(
        "❌ Erreur scheduler multi-églises :",
        error
      );
    } finally {
      isChecking = false;
    }
  };

// ======================================================
// DÉMARRAGE DU SCHEDULER
// ======================================================

const startAssignmentReminderJob =
  () => {
    console.log(
      "🔔 Scheduler multi-églises activé"
    );

    // ==================================================
    // PREMIÈRE VÉRIFICATION AU DÉMARRAGE
    // ==================================================

    checkChurchSchedulers().catch(
      (error) => {
        console.error(
          "❌ Erreur vérification initiale du scheduler :",
          error
        );
      }
    );

    // ==================================================
    // TOUTES LES 10 MINUTES
    // ==================================================

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

// ======================================================
// EXPORT
// ======================================================

module.exports =
  startAssignmentReminderJob;