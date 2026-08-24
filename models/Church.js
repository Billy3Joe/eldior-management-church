const mongoose = require("mongoose");

const churchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    address: {
      type: String,
      default: "",
      trim: true,
    },

    city: {
      type: String,
      default: "",
      trim: true,
    },

    country: {
      type: String,
      default: "",
      trim: true,
    },

    logo: {
      type: String,
      default: "",
    },

    // ==================================================
    // ABONNEMENT / STATUT
    // ==================================================

    status: {
      type: String,
      enum: [
        "trial",
        "active",
        "suspended",
        "cancelled",
      ],
      default: "trial",
    },

    plan: {
      type: String,
      enum: [
        "free",
        "starter",
        "pro",
        "premium",
      ],
      default: "free",
    },

    trialEndsAt: {
      type: Date,
      default: null,
    },

    subscriptionStartedAt: {
      type: Date,
      default: null,
    },

    subscriptionEndsAt: {
      type: Date,
      default: null,
    },

    maxMembers: {
      type: Number,
      default: 100,
      min: 1,
    },

    isActive: {
      type: Boolean,
      default: true,
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

module.exports = mongoose.model(
  "Church",
  churchSchema
);