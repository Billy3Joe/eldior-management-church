const Assignment = require(
  "../models/Assignment"
);

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

const sendEmail = require(
  "../utils/sendEmail"
);

const assignmentEmailTemplate = require(
  "../utils/assignmentEmailTemplate"
);

// ======================================================
// CALCULER LE NOMBRE DE JOURS AVANT L'ÉVÉNEMENT
// ======================================================

const getDaysBeforeEvent = (
  eventDate
) => {
  const now = new Date();

  const target =
    new Date(
      eventDate
    );

  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const eventDay =
    new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );

  const difference =
    eventDay.getTime() -
    today.getTime();

  return Math.round(
    difference /
      (
        1000 *
        60 *
        60 *
        24
      )
  );
};

// ======================================================
// VÉRIFIER SI UN RAPPEL A DÉJÀ ÉTÉ ENVOYÉ AUJOURD'HUI
// ======================================================

const reminderAlreadySentToday = (
  lastReminderAt
) => {
  if (!lastReminderAt) {
    return false;
  }

  const last =
    new Date(
      lastReminderAt
    );

  const now =
    new Date();

  return (
    last.getFullYear() ===
      now.getFullYear() &&
    last.getMonth() ===
      now.getMonth() &&
    last.getDate() ===
      now.getDate()
  );
};

// ======================================================
// VÉRIFIER SI UNE ÉGLISE PEUT UTILISER LES RAPPELS
// ======================================================

const canUseReminders = (
  church
) => {
  if (!church) {
    return false;
  }

  if (
    church.isActive ===
    false
  ) {
    return false;
  }

  const status =
    church.status ||
    "active";

  if (
    status !==
    "active"
  ) {
    return false;
  }

  const plan =
    String(
      church.plan ||
        "free"
    )
      .trim()
      .toLowerCase();

  const planConfig =
    getPlanConfig(
      plan
    );

  return (
    planConfig
      ?.features
      ?.reminders ===
    true
  );
};

// ======================================================
// VÉRIFIER SI UNE ÉGLISE PEUT UTILISER LES EMAILS
// ======================================================

const canUseEmailNotifications = (
  church
) => {
  if (!church) {
    return false;
  }

  const plan =
    String(
      church.plan ||
        "free"
    )
      .trim()
      .toLowerCase();

  const planConfig =
    getPlanConfig(
      plan
    );

  return (
    planConfig
      ?.features
      ?.emailNotifications ===
    true
  );
};

// ======================================================
// RÉCUPÉRER LES PARAMÈTRES D'UNE ÉGLISE
// ======================================================

const getChurchSettings =
  async (
    churchId
  ) => {
    if (!churchId) {
      return null;
    }

    const church =
      await Church.findById(
        churchId
      );

    if (!church) {
      return null;
    }

    const remindersAllowed =
      canUseReminders(
        church
      );

    const emailsAllowed =
      canUseEmailNotifications(
        church
      );

    let settings =
      await ChurchSettings.findOne(
        {
          church:
            churchId,
        }
      );

    // ==================================================
    // CRÉATION AUTOMATIQUE
    //
    // Très important :
    // on respecte directement le plan.
    // ==================================================

    if (!settings) {
      settings =
        await ChurchSettings.create(
          {
            church:
              churchId,

            churchName:
              church.name,

            reminderEnabled:
              remindersAllowed,

            reminderDays:
              [2, 1],

            reminderHour:
              9,

            timezone:
              "Europe/Paris",

            emailNotificationsEnabled:
              emailsAllowed,
          }
        );

      return settings;
    }

    // ==================================================
    // NETTOYAGE DES ANCIENNES CONFIGURATIONS
    // ==================================================

    let changed =
      false;

    if (
      !remindersAllowed &&
      settings.reminderEnabled ===
        true
    ) {
      settings.reminderEnabled =
        false;

      changed =
        true;
    }

    if (
      !emailsAllowed &&
      settings.emailNotificationsEnabled ===
        true
    ) {
      settings.emailNotificationsEnabled =
        false;

      changed =
        true;
    }

    if (changed) {
      await settings.save();
    }

    return settings;
  };

// ======================================================
// ENVOYER UN RAPPEL
// ======================================================

const sendReminder =
  async (
    assignment,
    daysBefore
  ) => {
    const member =
      assignment.member;

    const event =
      assignment.event;

    const department =
      assignment.department;

    const church =
      assignment.church;

    if (!church) {
      console.log(
        "⚠️ Rappel ignoré : aucune église associée"
      );

      return false;
    }

    // ==================================================
    // DOUBLE SÉCURITÉ DU PLAN
    // ==================================================

    if (
      !canUseReminders(
        church
      )
    ) {
      console.log(
        `🔒 Rappel ignoré : le plan de l'église ${church._id} n'autorise pas les rappels`
      );

      return false;
    }

    if (
      !canUseEmailNotifications(
        church
      )
    ) {
      console.log(
        `🔒 Email ignoré : le plan de l'église ${church._id} n'autorise pas les notifications email`
      );

      return false;
    }

    // ==================================================
    // EMAIL DU MEMBRE
    // ==================================================

    if (!member?.email) {
      console.log(
        `⚠️ Rappel ignoré : aucun email pour ${
          member?.firstName ||
          "le membre"
        }`
      );

      return false;
    }

    // ==================================================
    // TOKEN DE RÉPONSE
    // ==================================================

    if (
      !assignment.responseToken
    ) {
      console.log(
        `⚠️ Rappel ignoré : aucun token pour ${member.email}`
      );

      return false;
    }

    // ==================================================
    // URL FRONTEND
    // ==================================================

    const frontendUrl =
      process.env
        .FRONTEND_URL ||
      "http://localhost:5173";

    const confirmUrl =
      `${frontendUrl}/assignment-response/${assignment.responseToken}?action=confirm`;

    const declineUrl =
      `${frontendUrl}/assignment-response/${assignment.responseToken}?action=decline`;

    // ==================================================
    // TEMPLATE
    // ==================================================

    const html =
      assignmentEmailTemplate(
        {
          member,
          event,
          department,
          church,
          assignment,
          confirmUrl,
          declineUrl,
        }
      );

    const reminderText =
      `Rappel J-${daysBefore}`;

    // ==================================================
    // ENVOI
    // ==================================================

    await sendEmail({
      to:
        member.email,

      subject:
        `${reminderText} - ${
          event?.title ||
          "Événement"
        }`,

      html,
    });

    // ==================================================
    // MISE À JOUR ASSIGNATION
    // ==================================================

    const now =
      new Date();

    assignment.emailStatus =
      "sent";

    if (
      !assignment
        .firstEmailSentAt
    ) {
      assignment.firstEmailSentAt =
        now;
    }

    assignment.emailSentAt =
      now;

    assignment.emailSendCount =
      (
        assignment
          .emailSendCount ||
        0
      ) + 1;

    assignment.reminderCount =
      (
        assignment
          .reminderCount ||
        0
      ) + 1;

    assignment.lastReminderAt =
      now;

    await assignment.save();

    console.log(
      `✅ ${reminderText} envoyé à ${member.email}`
    );

    return true;
  };

// ======================================================
// TRAITER LES RAPPELS D'UNE ÉGLISE
// ======================================================

const processChurchReminders =
  async (
    churchId
  ) => {
    try {
      if (!churchId) {
        return {
          success:
            false,

          sentCount:
            0,

          reason:
            "CHURCH_REQUIRED",
        };
      }

      // ==================================================
      // ÉGLISE
      // ==================================================

      const church =
        await Church.findById(
          churchId
        );

      if (!church) {
        return {
          success:
            false,

          sentCount:
            0,

          reason:
            "CHURCH_NOT_FOUND",
        };
      }

      // ==================================================
      // ABONNEMENT ACTIF
      // ==================================================

      if (
        church.isActive ===
          false ||
        (
          church.status &&
          church.status !==
            "active"
        )
      ) {
        console.log(
          `🔒 Rappels ignorés : église ${churchId} inactive`
        );

        return {
          success:
            true,

          sentCount:
            0,

          reason:
            "CHURCH_INACTIVE",
        };
      }

      // ==================================================
      // PREMIUM REQUIS
      // ==================================================

      if (
        !canUseReminders(
          church
        )
      ) {
        console.log(
          `🔒 Rappels ignorés pour ${church.name} : plan ${church.plan || "free"}`
        );

        return {
          success:
            true,

          sentCount:
            0,

          reason:
            "REMINDERS_NOT_AVAILABLE",
        };
      }

      // ==================================================
      // EMAILS REQUIS
      // ==================================================

      if (
        !canUseEmailNotifications(
          church
        )
      ) {
        console.log(
          `🔒 Emails non disponibles pour ${church.name}`
        );

        return {
          success:
            true,

          sentCount:
            0,

          reason:
            "EMAIL_NOTIFICATIONS_NOT_AVAILABLE",
        };
      }

      // ==================================================
      // SETTINGS
      // ==================================================

      const settings =
        await getChurchSettings(
          churchId
        );

      if (!settings) {
        return {
          success:
            false,

          sentCount:
            0,

          reason:
            "SETTINGS_NOT_FOUND",
        };
      }

      // ==================================================
      // RAPPELS DÉSACTIVÉS
      // ==================================================

      if (
        !settings
          .reminderEnabled
      ) {
        console.log(
          `🔕 Rappels désactivés pour l'église ${churchId}`
        );

        return {
          success:
            true,

          sentCount:
            0,

          reason:
            "REMINDERS_DISABLED",
        };
      }

      // ==================================================
      // EMAILS DÉSACTIVÉS
      // ==================================================

      if (
        settings
          .emailNotificationsEnabled ===
        false
      ) {
        console.log(
          `🔕 Emails désactivés pour l'église ${churchId}`
        );

        return {
          success:
            true,

          sentCount:
            0,

          reason:
            "EMAILS_DISABLED",
        };
      }

      // ==================================================
      // JOURS DE RAPPEL
      // ==================================================

      const reminderDays =
        Array.isArray(
          settings.reminderDays
        ) &&
        settings
          .reminderDays
          .length
          ? settings.reminderDays
          : [2, 1];

      console.log(
        `📅 Église ${churchId} - rappels :`,
        reminderDays
      );

      // ==================================================
      // ASSIGNATIONS EN ATTENTE
      // ==================================================

      const assignments =
        await Assignment.find(
          {
            church:
              churchId,

            status:
              "pending",
          }
        )
          .populate(
            "member",
            "firstName lastName email"
          )
          .populate(
            "event",
            "title date location status"
          )
          .populate(
            "department",
            "name"
          )
          .populate(
            "church",
            "name slug plan status isActive"
          );

      let sentCount =
        0;

      // ==================================================
      // TRAITEMENT
      // ==================================================

      for (
        const assignment of
        assignments
      ) {
        try {
          if (
            !assignment.event
              ?.date
          ) {
            continue;
          }

          if (
            [
              "Terminé",
              "Annulé",
            ].includes(
              assignment
                .event
                .status
            )
          ) {
            continue;
          }

          const daysBefore =
            getDaysBeforeEvent(
              assignment
                .event
                .date
            );

          if (
            !reminderDays.includes(
              daysBefore
            )
          ) {
            continue;
          }

          // ==================================================
          // PAS DE DOUBLE RAPPEL LE MÊME JOUR
          // ==================================================

          if (
            reminderAlreadySentToday(
              assignment
                .lastReminderAt
            )
          ) {
            console.log(
              `ℹ️ Rappel déjà envoyé aujourd'hui à ${
                assignment
                  .member
                  ?.email ||
                assignment._id
              }`
            );

            continue;
          }

          const sent =
            await sendReminder(
              assignment,
              daysBefore
            );

          if (sent) {
            sentCount++;
          }
        } catch (
          assignmentError
        ) {
          console.error(
            `❌ Erreur rappel programmation ${assignment._id} :`,
            assignmentError
              .message
          );
        }
      }

      console.log(
        `🔔 Église ${churchId} : ${sentCount} rappel(s) envoyé(s)`
      );

      return {
        success:
          true,

        sentCount,
      };
    } catch (error) {
      console.error(
        `❌ Erreur rappels église ${churchId} :`,
        error.message
      );

      return {
        success:
          false,

        sentCount:
          0,

        error:
          error.message,
      };
    }
  };

// ======================================================
// TRAITER TOUTES LES ÉGLISES
// ======================================================

const processAssignmentReminders =
  async () => {
    try {
      console.log(
        "🔔 Vérification multi-églises des rappels..."
      );

      // ==================================================
      // UNIQUEMENT SETTINGS AVEC RAPPELS ACTIVÉS
      // ==================================================

      const settingsList =
        await ChurchSettings.find(
          {
            church: {
              $ne: null,
            },

            reminderEnabled:
              true,
          }
        ).select(
          "church reminderEnabled"
        );

      if (
        settingsList.length ===
        0
      ) {
        console.log(
          "ℹ️ Aucune église configurée pour les rappels"
        );

        return {
          success:
            true,

          churchesProcessed:
            0,

          sentCount:
            0,
        };
      }

      let churchesProcessed =
        0;

      let totalSent =
        0;

      // ==================================================
      // TRAITEMENT
      // ==================================================

      for (
        const settings of
        settingsList
      ) {
        if (
          !settings.church
        ) {
          continue;
        }

        const result =
          await processChurchReminders(
            settings.church
          );

        churchesProcessed++;

        totalSent +=
          result.sentCount ||
          0;
      }

      console.log(
        `🔔 Vérification terminée : ${churchesProcessed} église(s), ${totalSent} rappel(s) envoyé(s)`
      );

      return {
        success:
          true,

        churchesProcessed,

        sentCount:
          totalSent,
      };
    } catch (error) {
      console.error(
        "❌ Erreur processAssignmentReminders :",
        error.message
      );

      return {
        success:
          false,

        churchesProcessed:
          0,

        sentCount:
          0,

        error:
          error.message,
      };
    }
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  processAssignmentReminders,
  processChurchReminders,
  sendReminder,
  getDaysBeforeEvent,
  getChurchSettings,
};