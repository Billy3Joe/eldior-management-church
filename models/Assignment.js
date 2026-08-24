const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
    // ==================================================
    // ÉGLISE / TENANT
    // ==================================================

    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
      index: true,
    },

    // ==================================================
    // PROGRAMMATION
    // ==================================================

    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    role: {
      type: String,
      required: true,
      trim: true,
    },

    note: {
      type: String,
      default: "",
      trim: true,
    },

    // ==================================================
    // RÉPONSE DU MEMBRE
    // ==================================================

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "declined",
        "cancelled",
      ],
      default: "pending",
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    declinedAt: {
      type: Date,
      default: null,
    },

    // ==================================================
    // LIEN PUBLIC
    // ==================================================

    responseToken: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },

    responseTokenExpiresAt: {
      type: Date,
      default: null,
    },

    // ==================================================
    // EMAIL
    // ==================================================

    emailStatus: {
      type: String,
      enum: [
        "not_sent",
        "sent",
        "failed",
      ],
      default: "not_sent",
    },

    firstEmailSentAt: {
      type: Date,
      default: null,
    },

    emailSentAt: {
      type: Date,
      default: null,
    },

    emailSendCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==================================================
    // RAPPELS
    // ==================================================

    reminderCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastReminderAt: {
      type: Date,
      default: null,
    },

    // ==================================================
    // CRÉATEUR
    // ==================================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Évite les doublons dans une même église.
assignmentSchema.index(
  {
    church: 1,
    member: 1,
    event: 1,
    role: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "Assignment",
  assignmentSchema
);