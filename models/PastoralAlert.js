const mongoose = require("mongoose");

// ======================================================
// CONSTANTES
// ======================================================

const ALERT_TYPES = [
  "Absence prolongée",
];

const ALERT_LEVELS = [
  "Attention",
  "À suivre",
  "Critique",
];

const ALERT_STATUSES = [
  "Ouverte",
  "En cours",
  "Résolue",
];

// ======================================================
// SCHÉMA
// ======================================================

const pastoralAlertSchema =
  new mongoose.Schema(
    {
      // ==================================================
      // ÉGLISE / TENANT
      // ==================================================

      church: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Church",
        required: true,
        index: true,
      },

      // ==================================================
      // PERSONNE
      // ==================================================

      member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        required: true,
        index: true,
      },

      // ==================================================
      // TYPE D'ALERTE
      // ==================================================

      type: {
        type: String,
        enum: ALERT_TYPES,
        default: "Absence prolongée",
        required: true,
        index: true,
      },

      // ==================================================
      // NIVEAU
      // ==================================================

      level: {
        type: String,
        enum: ALERT_LEVELS,
        required: true,
        index: true,
      },

      // ==================================================
      // DONNÉES DE DÉTECTION
      // ==================================================

      consecutiveMissedServices: {
        type: Number,
        default: 0,
        min: 0,
      },

      lastPresenceDate: {
        type: Date,
        default: null,
      },

      lastCheckedServiceDate: {
        type: Date,
        default: null,
      },

      daysSinceLastPresence: {
        type: Number,
        default: null,
        min: 0,
      },

      // ==================================================
      // TRAITEMENT PASTORAL
      // ==================================================

      status: {
        type: String,
        enum: ALERT_STATUSES,
        default: "Ouverte",
        index: true,
      },

      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      note: {
        type: String,
        default: "",
        trim: true,
      },

      contactedAt: {
        type: Date,
        default: null,
      },

      resolvedAt: {
        type: Date,
        default: null,
      },

      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      // ==================================================
      // DÉTECTION
      // ==================================================

      detectedAt: {
        type: Date,
        default: Date.now,
        index: true,
      },

      lastDetectedAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      timestamps: true,
    }
  );

// ======================================================
// INDEXES
// ======================================================

pastoralAlertSchema.index({
  church: 1,
  status: 1,
  level: 1,
});

pastoralAlertSchema.index({
  church: 1,
  member: 1,
  type: 1,
});

pastoralAlertSchema.index({
  church: 1,
  assignedTo: 1,
  status: 1,
});

pastoralAlertSchema.index({
  church: 1,
  detectedAt: -1,
});

// Une seule alerte d'absence prolongée active/logique
// par personne et par église.

pastoralAlertSchema.index(
  {
    church: 1,
    member: 1,
    type: 1,
  },
  {
    unique: true,
    name:
      "unique_church_member_pastoral_alert_type",
  }
);

// ======================================================
// EXPORT
// ======================================================

module.exports =
  mongoose.model(
    "PastoralAlert",
    pastoralAlertSchema
  );