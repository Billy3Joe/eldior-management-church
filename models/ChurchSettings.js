const mongoose = require("mongoose");

const churchSettingsSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
    },

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

    emailNotificationsEnabled: {
      type: Boolean,
      default: true,
    },

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

// Une seule configuration par église.
// sparse permet encore temporairement les anciens documents
// avec church = null pendant la migration.
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