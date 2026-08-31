const ChurchSettings = require(
  "../models/ChurchSettings"
);

const Church = require(
  "../models/Church"
);

const createActivityLog = require(
  "../utils/createActivityLog"
);

// ======================================================
// HELPERS
// ======================================================

const hasFeature = (
  req,
  feature
) => {
  return (
    req.subscription
      ?.config
      ?.features?.[
      feature
    ] === true
  );
};

// ======================================================
// RÉCUPÉRER LES PARAMÈTRES DE L'ÉGLISE
// ======================================================

const getSettings = async (
  req,
  res
) => {
  try {
    // ==================================================
    // ÉGLISE
    // ==================================================

    if (!req.churchId) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            "Aucune église associée à cet utilisateur",
        });
    }

    // ==================================================
    // RÉCUPÉRER L'ÉGLISE
    // ==================================================

    const church =
      await Church.findById(
        req.churchId
      );

    if (!church) {
      return res
        .status(404)
        .json({
          success: false,

          message:
            "Église introuvable",
        });
    }

    // ==================================================
    // PARAMÈTRES
    // ==================================================

    let settings =
      await ChurchSettings.findOne({
        church:
          req.churchId,
      });

    // ==================================================
    // CRÉATION AUTOMATIQUE
    // ==================================================

    if (!settings) {
      settings =
        await ChurchSettings.create({
          church:
            church._id,

          churchName:
            church.name,

          logo:
            church.logo || "",

          reminderEnabled:
            hasFeature(
              req,
              "reminders"
            ),

          reminderDays:
            [2, 1],

          reminderHour:
            9,

          timezone:
            "Europe/Paris",

          emailNotificationsEnabled:
            hasFeature(
              req,
              "emailNotifications"
            ),
        });
    }

    // ==================================================
    // SÉCURITÉ ABONNEMENT
    //
    // Une église Free/Standard ne doit pas conserver
    // des fonctions Premium activées par erreur.
    // ==================================================

    let needsSave = false;

    if (
      !hasFeature(
        req,
        "reminders"
      ) &&
      settings.reminderEnabled ===
        true
    ) {
      settings.reminderEnabled =
        false;

      needsSave = true;
    }

    if (
      !hasFeature(
        req,
        "emailNotifications"
      ) &&
      settings.emailNotificationsEnabled ===
        true
    ) {
      settings.emailNotificationsEnabled =
        false;

      needsSave = true;
    }

    if (needsSave) {
      await settings.save();
    }

    // ==================================================
    // RÉPONSE
    // ==================================================

    return res
      .status(200)
      .json({
        success: true,

        data:
          settings,

        subscription: {
          plan:
            req.subscription
              ?.plan ||
            church.plan ||
            "free",

          features:
            req.subscription
              ?.config
              ?.features ||
            {},
        },
      });
  } catch (error) {
    console.error(
      "Erreur getSettings :",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          error.message,
      });
  }
};

// ======================================================
// METTRE À JOUR LES PARAMÈTRES
// ======================================================

const updateSettings = async (
  req,
  res
) => {
  try {
    // ==================================================
    // ÉGLISE
    // ==================================================

    if (!req.churchId) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            "Aucune église associée à cet utilisateur",
        });
    }

    // ==================================================
    // BODY
    // ==================================================

    const {
      reminderEnabled,
      reminderDays,
      reminderHour,
      timezone,

      churchName,
      emailNotificationsEnabled,

      primaryColor,
      logo,
    } = req.body;

    // ==================================================
    // RÉCUPÉRER L'ÉGLISE
    // ==================================================

    const church =
      await Church.findById(
        req.churchId
      );

    if (!church) {
      return res
        .status(404)
        .json({
          success: false,

          message:
            "Église introuvable",
        });
    }

    // ==================================================
    // RÉCUPÉRER / CRÉER SETTINGS
    // ==================================================

    let settings =
      await ChurchSettings.findOne({
        church:
          req.churchId,
      });

    if (!settings) {
      settings =
        new ChurchSettings({
          church:
            req.churchId,

          churchName:
            church.name,

          logo:
            church.logo || "",

          reminderEnabled:
            false,

          emailNotificationsEnabled:
            false,
        });
    }

    // ==================================================
    // INFORMATIONS GÉNÉRALES
    //
    // ACCESSIBLES À TOUS LES PLANS
    // ==================================================

    if (
      typeof churchName !==
      "undefined"
    ) {
      const cleanChurchName =
        String(
          churchName
        ).trim();

      if (!cleanChurchName) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Le nom de l'église est obligatoire",
          });
      }

      settings.churchName =
        cleanChurchName;

      church.name =
        cleanChurchName;
    }

    if (
      typeof logo !==
      "undefined"
    ) {
      settings.logo =
        String(
          logo || ""
        );

      church.logo =
        String(
          logo || ""
        );
    }

    // ==================================================
    // PERSONNALISATION AVANCÉE
    //
    // STANDARD + PREMIUM
    // ==================================================

    if (
      typeof primaryColor !==
      "undefined"
    ) {
      if (
        !hasFeature(
          req,
          "advancedSettings"
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            code:
              "FEATURE_NOT_AVAILABLE",

            feature:
              "advancedSettings",

            plan:
              req.subscription
                ?.plan,

            message:
              "La personnalisation avancée n'est pas disponible avec votre abonnement actuel",
          });
      }

      settings.primaryColor =
        String(
          primaryColor || ""
        );
    }

    // ==================================================
    // NOTIFICATIONS EMAIL
    //
    // STANDARD + PREMIUM
    // ==================================================

    if (
      typeof emailNotificationsEnabled !==
      "undefined"
    ) {
      if (
        !hasFeature(
          req,
          "emailNotifications"
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            code:
              "FEATURE_NOT_AVAILABLE",

            feature:
              "emailNotifications",

            plan:
              req.subscription
                ?.plan,

            message:
              "Les notifications par email ne sont pas disponibles avec votre abonnement actuel",
          });
      }

      settings.emailNotificationsEnabled =
        Boolean(
          emailNotificationsEnabled
        );
    }

    // ==================================================
    // RAPPELS AUTOMATIQUES
    //
    // PREMIUM UNIQUEMENT
    // ==================================================

    const reminderConfigurationRequested =
      typeof reminderEnabled !==
        "undefined" ||
      typeof reminderDays !==
        "undefined" ||
      typeof reminderHour !==
        "undefined" ||
      typeof timezone !==
        "undefined";

    if (
      reminderConfigurationRequested &&
      !hasFeature(
        req,
        "reminders"
      )
    ) {
      return res
        .status(403)
        .json({
          success: false,

          code:
            "FEATURE_NOT_AVAILABLE",

          feature:
            "reminders",

          plan:
            req.subscription
              ?.plan,

          message:
            "Les rappels automatiques sont réservés à l'abonnement Premium",
        });
    }

    // ==================================================
    // ACTIVER / DÉSACTIVER RAPPELS
    // ==================================================

    if (
      typeof reminderEnabled !==
      "undefined"
    ) {
      settings.reminderEnabled =
        Boolean(
          reminderEnabled
        );
    }

    // ==================================================
    // JOURS DE RAPPEL
    // ==================================================

    if (
      typeof reminderDays !==
      "undefined"
    ) {
      if (
        !Array.isArray(
          reminderDays
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Les jours de rappel doivent être envoyés sous forme de tableau",
          });
      }

      const cleanDays = [
        ...new Set(
          reminderDays
            .map(Number)
            .filter(
              (day) =>
                !Number.isNaN(
                  day
                ) &&
                day >= 0 &&
                day <= 30
            )
        ),
      ].sort(
        (a, b) =>
          b - a
      );

      settings.reminderDays =
        cleanDays;
    }

    // ==================================================
    // HEURE DE RAPPEL
    // ==================================================

    if (
      typeof reminderHour !==
      "undefined"
    ) {
      const hour =
        Number(
          reminderHour
        );

      if (
        Number.isNaN(
          hour
        ) ||
        hour < 0 ||
        hour > 23
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "L'heure de rappel doit être comprise entre 0 et 23",
          });
      }

      settings.reminderHour =
        hour;
    }

    // ==================================================
    // FUSEAU HORAIRE
    // ==================================================

    if (
      typeof timezone !==
      "undefined"
    ) {
      const cleanTimezone =
        String(
          timezone ||
            "Europe/Paris"
        ).trim();

      try {
        Intl.DateTimeFormat(
          "fr-FR",
          {
            timeZone:
              cleanTimezone,
          }
        );
      } catch (error) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Fuseau horaire invalide",
          });
      }

      settings.timezone =
        cleanTimezone;
    }

    // ==================================================
    // SAUVEGARDE
    // ==================================================

    await settings.save();

    await church.save();

    // ==================================================
    // JOURNAL
    // ==================================================

    try {
      await createActivityLog({
        req,

        action:
          "UPDATE",

        entity:
          "Settings",

        entityId:
          settings._id,

        description:
          "Mise à jour des paramètres de l'église",
      });
    } catch (logError) {
      console.error(
        "Erreur création ActivityLog :",
        logError
      );
    }

    // ==================================================
    // RÉPONSE
    // ==================================================

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Paramètres enregistrés avec succès",

        data:
          settings,

        church: {
          _id:
            church._id,

          name:
            church.name,

          logo:
            church.logo,

          plan:
            church.plan,

          status:
            church.status,
        },

        subscription: {
          plan:
            req.subscription
              ?.plan ||
            church.plan ||
            "free",

          features:
            req.subscription
              ?.config
              ?.features ||
            {},
        },
      });
  } catch (error) {
    console.error(
      "Erreur updateSettings :",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          error.message,
      });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getSettings,
  updateSettings,
};