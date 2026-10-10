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
    // PARAMÈTRES RÉGIONAUX
    // ==================================================

    /**
     * Devise principale de l'église.
     *
     * Elle sert de devise par défaut pour :
     * - les nouveaux comptes financiers ;
     * - les transactions ;
     * - les budgets ;
     * - les tableaux de bord financiers.
     *
     * Une église peut néanmoins posséder plusieurs
     * comptes utilisant des devises différentes.
     */
    defaultCurrency: {
      type: String,
      default: "EUR",
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
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
// NORMALISATION
// ======================================================

churchSchema.pre("save", function () {
  this.defaultCurrency = String(
    this.defaultCurrency || "EUR"
  )
    .trim()
    .toUpperCase();
});

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