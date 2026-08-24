const ChurchSettings = require("../models/ChurchSettings");
const createActivityLog = require("../utils/createActivityLog");

// Récupérer les paramètres
const getSettings = async (req, res) => {
  try {
    let settings = await ChurchSettings.findOne();

    if (!settings) {
      settings = await ChurchSettings.create({});
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Mettre à jour les paramètres
const updateSettings = async (req, res) => {
  try {
    const {
      reminderEnabled,
      reminderDays,
      reminderHour,
      timezone,
      churchName,
    } = req.body;

    let settings = await ChurchSettings.findOne();

    if (!settings) {
      settings = new ChurchSettings();
    }

    if (typeof reminderEnabled !== "undefined") {
      settings.reminderEnabled = reminderEnabled;
    }

    if (Array.isArray(reminderDays)) {
      const cleanDays = [
        ...new Set(
          reminderDays
            .map(Number)
            .filter((day) => day >= 0 && day <= 30)
        ),
      ].sort((a, b) => b - a);

      settings.reminderDays = cleanDays;
    }

    if (typeof reminderHour !== "undefined") {
      const hour = Number(reminderHour);

      if (
        Number.isNaN(hour) ||
        hour < 0 ||
        hour > 23
      ) {
        return res.status(400).json({
          success: false,
          message:
            "L'heure de rappel doit être comprise entre 0 et 23",
        });
      }

      settings.reminderHour = hour;
    }

    if (timezone) {
      settings.timezone = timezone;
    }

    if (typeof churchName !== "undefined") {
      settings.churchName = churchName.trim();
    }

    await settings.save();

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Settings",
      entityId: settings._id,
      description:
        "Mise à jour des paramètres de l'église",
    });

    return res.status(200).json({
      success: true,
      message: "Paramètres enregistrés avec succès",
      data: settings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};