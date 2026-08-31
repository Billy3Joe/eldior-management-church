const mongoose = require("mongoose");

const churchSchema = new mongoose.Schema(
  {
    // ==================================================
    // IDENTITÉ
    // ==================================================

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
        "standard",
        "premium",
      ],
      default: "free",
      index: true,
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

    // ==================================================
    // COMPATIBILITÉ / ANCIENNE LIMITE
    // ==================================================
    // Les vraies limites sont maintenant gérées dans
    // config/planLimits.js.
    // On conserve ce champ uniquement pour compatibilité
    // avec d'éventuelles anciennes données.
    // ==================================================

    maxMembers: {
      type: Number,
      default: 100,
      min: 1,
    },

    // ==================================================
    // ACTIVATION GLOBALE
    // ==================================================

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

// ======================================================
// INDEX UTILES
// ======================================================

churchSchema.index({
  plan: 1,
  status: 1,
  isActive: 1,
});

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "Church",
  churchSchema
);