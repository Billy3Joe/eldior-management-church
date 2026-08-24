const Assignment = require("../models/Assignment");
const ChurchSettings = require("../models/ChurchSettings");

const sendEmail = require("../utils/sendEmail");
const assignmentEmailTemplate = require(
  "../utils/assignmentEmailTemplate"
);

// ======================================================
// CALCULER LE NOMBRE DE JOURS AVANT L'ÉVÉNEMENT
// ======================================================

const getDaysBeforeEvent = (eventDate) => {
  const now = new Date();
  const target = new Date(eventDate);

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const eventDay = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  const difference =
    eventDay.getTime() - today.getTime();

  return Math.round(
    difference / (1000 * 60 * 60 * 24)
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

  const last = new Date(lastReminderAt);
  const now = new Date();

  return (
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate()
  );
};

// ======================================================
// ENVOYER UN RAPPEL
// ======================================================

const sendReminder = async (
  assignment,
  daysBefore
) => {
  const member = assignment.member;
  const event = assignment.event;
  const department = assignment.department;

  if (!member?.email) {
    console.log(
      `Rappel ignoré : aucun email pour ${
        member?.firstName || "le membre"
      }`
    );

    return false;
  }

  if (!assignment.responseToken) {
    console.log(
      `Rappel ignoré : aucun token pour ${member.email}`
    );

    return false;
  }

  const frontendUrl =
    process.env.FRONTEND_URL ||
    "http://localhost:5173";

  const confirmUrl =
    `${frontendUrl}/assignment-response/${assignment.responseToken}?action=confirm`;

  const declineUrl =
    `${frontendUrl}/assignment-response/${assignment.responseToken}?action=decline`;

  const html = assignmentEmailTemplate({
    member,
    event,
    department,
    assignment,
    confirmUrl,
    declineUrl,
  });

  let reminderText =
    "Rappel de programmation";

  if (daysBefore === 1) {
    reminderText = "Rappel J-1";
  } else if (daysBefore === 2) {
    reminderText = "Rappel J-2";
  } else {
    reminderText = `Rappel J-${daysBefore}`;
  }

  await sendEmail({
    to: member.email,
    subject:
      `${reminderText} - ${
        event?.title || "Événement"
      }`,
    html,
  });

  const now = new Date();

  assignment.emailStatus = "sent";

  if (!assignment.firstEmailSentAt) {
    assignment.firstEmailSentAt = now;
  }

  assignment.emailSentAt = now;

  assignment.emailSendCount =
    (assignment.emailSendCount || 0) + 1;

  assignment.reminderCount =
    (assignment.reminderCount || 0) + 1;

  assignment.lastReminderAt = now;

  await assignment.save();

  console.log(
    `✅ ${reminderText} envoyé à ${member.email}`
  );

  return true;
};

// ======================================================
// PROCESS PRINCIPAL DES RAPPELS
// ======================================================

const processAssignmentReminders = async () => {
  try {
    console.log(
      "🔔 Vérification des rappels de programmation..."
    );

    // ================================================
    // RÉCUPÉRER LES SETTINGS
    // ================================================

    let settings =
      await ChurchSettings.findOne();

    if (!settings) {
      settings =
        await ChurchSettings.create({});
    }

    // ================================================
    // RAPPELS DÉSACTIVÉS
    // ================================================

    if (!settings.reminderEnabled) {
      console.log(
        "🔕 Rappels automatiques désactivés"
      );

      return {
        success: true,
        sentCount: 0,
      };
    }

    // ================================================
    // JOURS DE RAPPEL CONFIGURÉS
    // ================================================

    const reminderDays =
      settings.reminderDays?.length
        ? settings.reminderDays
        : [2, 1];

    console.log(
      "📅 Jours de rappel configurés :",
      reminderDays
    );

    // ================================================
    // PROGRAMMATIONS EN ATTENTE UNIQUEMENT
    // ================================================

    const assignments =
      await Assignment.find({
        status: "pending",
      })
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
        );

    let sentCount = 0;

    // ================================================
    // PARCOURIR LES PROGRAMMATIONS
    // ================================================

    for (const assignment of assignments) {
      try {
        // Pas d'événement
        if (!assignment.event) {
          continue;
        }

        // Pas de date
        if (!assignment.event.date) {
          continue;
        }

        // ============================================
        // NE PAS ENVOYER POUR ÉVÉNEMENT TERMINÉ/ANNULÉ
        // ============================================

        const eventStatus =
          assignment.event.status;

        if (
          eventStatus === "Terminé" ||
          eventStatus === "Annulé"
        ) {
          continue;
        }

        // ============================================
        // CALCULER J-X
        // ============================================

        const daysBefore =
          getDaysBeforeEvent(
            assignment.event.date
          );

        console.log(
          `Programmation ${
            assignment._id
          } : J-${daysBefore}`
        );

        // ============================================
        // LE JOUR EST-IL CONFIGURÉ ?
        // ============================================

        if (
          !reminderDays.includes(
            daysBefore
          )
        ) {
          continue;
        }

        // ============================================
        // ÉVITER DOUBLE RAPPEL LE MÊME JOUR
        // ============================================

        if (
          reminderAlreadySentToday(
            assignment.lastReminderAt
          )
        ) {
          console.log(
            `Rappel déjà envoyé aujourd'hui pour ${
              assignment.member?.email ||
              assignment._id
            }`
          );

          continue;
        }

        // ============================================
        // ENVOYER LE RAPPEL
        // ============================================

        const sent =
          await sendReminder(
            assignment,
            daysBefore
          );

        if (sent) {
          sentCount++;
        }
      } catch (assignmentError) {
        console.error(
          "❌ Erreur sur une programmation :",
          assignmentError.message
        );
      }
    }

    console.log(
      `🔔 Vérification terminée : ${sentCount} rappel(s) envoyé(s)`
    );

    return {
      success: true,
      sentCount,
    };
  } catch (error) {
    console.error(
      "❌ Erreur processAssignmentReminders :",
      error.message
    );

    return {
      success: false,
      sentCount: 0,
      error: error.message,
    };
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  processAssignmentReminders,
  sendReminder,
  getDaysBeforeEvent,
};