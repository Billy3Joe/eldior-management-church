const mongoose = require("mongoose");

const churchSettingsSchema = new mongoose.Schema(
  {
    // ==========================================
    // ÉGLISE / TENANT
    // Temporairement facultatif pendant
    // la migration multi-tenant
    // ==========================================

    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
      index: true,
    },

    // ==========================================
    // RAPPELS
    // ==========================================

    reminderEnabled: {
      type: Boolean,
      default: true,
    },

    reminderDays: {
      type: [Number],
      default: [2, 1],
    },

    reminderHour: {
      type: Number,
      default: 9,
      min: 0,
      max: 23,
    },

    timezone: {
      type: String,
      default: "Europe/Paris",
    },

    // ==========================================
    // NOTIFICATIONS
    // ==========================================

    emailNotificationsEnabled: {
      type: Boolean,
      default: true,
    },

    // ==========================================
    // INFORMATIONS ÉGLISE
    // ==========================================

    churchName: {
      type: String,
      default: "ElDior Management Church",
      trim: true,
    },

    logo: {
      type: String,
      default: "",
    },

    primaryColor: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Une seule configuration par église,
// uniquement lorsqu'une église est renseignée.
churchSettingsSchema.index(
  {
    church: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

module.exports = mongoose.model(
  "ChurchSettings",
  churchSettingsSchema
);