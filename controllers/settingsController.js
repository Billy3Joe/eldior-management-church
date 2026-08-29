const ChurchSettings = require("../models/ChurchSettings");
const Church = require("../models/Church");

const createActivityLog = require(
  "../utils/createActivityLog"
);

// ======================================================
// RÉCUPÉRER LES PARAMÈTRES DE L'ÉGLISE
// ======================================================

const getSettings = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    let settings =
      await ChurchSettings.findOne({
        church: req.churchId,
      });

    // Si cette église n'a pas encore de paramètres,
    // on les crée automatiquement.
    if (!settings) {
      const church =
        await Church.findById(
          req.churchId
        );

      if (!church) {
        return res.status(404).json({
          success: false,
          message:
            "Église introuvable",
        });
      }

      settings =
        await ChurchSettings.create({
          church:
            church._id,

          churchName:
            church.name,

          reminderEnabled:
            true,

          reminderDays:
            [2, 1],

          reminderHour:
            9,

          timezone:
            "Europe/Paris",

          emailNotificationsEnabled:
            true,
        });
    }

    return res.status(200).json({
      success: true,
      data:
        settings,
    });
  } catch (error) {
    console.error(
      "Erreur getSettings :",
      error
    );

    return res.status(500).json({
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
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

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
        });
    }

    // ==================================================
    // RAPPELS
    // ==================================================

    if (
      typeof reminderEnabled !==
      "undefined"
    ) {
      settings.reminderEnabled =
        reminderEnabled;
    }

    if (
      Array.isArray(
        reminderDays
      )
    ) {
      const cleanDays = [
        ...new Set(
          reminderDays
            .map(Number)
            .filter(
              (day) =>
                !Number.isNaN(day) &&
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
        return res.status(400).json({
          success: false,
          message:
            "L'heure de rappel doit être comprise entre 0 et 23",
        });
      }

      settings.reminderHour =
        hour;
    }

    if (
      typeof timezone !==
      "undefined"
    ) {
      settings.timezone =
        timezone ||
        "Europe/Paris";
    }

    // ==================================================
    // NOTIFICATIONS EMAIL
    // ==================================================

    if (
      typeof emailNotificationsEnabled !==
      "undefined"
    ) {
      settings.emailNotificationsEnabled =
        emailNotificationsEnabled;
    }

    // ==================================================
    // INFORMATIONS ÉGLISE
    // ==================================================

    if (
      typeof churchName !==
      "undefined"
    ) {
      settings.churchName =
        churchName.trim();
    }

    if (
      typeof primaryColor !==
      "undefined"
    ) {
      settings.primaryColor =
        primaryColor;
    }

    if (
      typeof logo !==
      "undefined"
    ) {
      settings.logo =
        logo;
    }

    await settings.save();

    // Synchroniser le nom principal
    // dans la collection Church.
    if (
      typeof churchName !==
        "undefined" &&
      churchName.trim()
    ) {
      await Church.findOneAndUpdate(
        {
          _id:
            req.churchId,
        },
        {
          $set: {
            name:
              churchName.trim(),
          },
        }
      );
    }

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

    return res.status(200).json({
      success: true,
      message:
        "Paramètres enregistrés avec succès",
      data:
        settings,
    });
  } catch (error) {
    console.error(
      "Erreur updateSettings :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};