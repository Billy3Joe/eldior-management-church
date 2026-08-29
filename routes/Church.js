const mongoose = require("mongoose");

// ======================================================
// SCHÉMA CHURCH
// ======================================================

const churchSchema = new mongoose.Schema(
  {
    // ==================================================
    // INFORMATIONS GÉNÉRALES
    // ==================================================

    name: {
      type: String,
      required: [
        true,
        "Le nom de l'église est requis",
      ],
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      index: true,
    },

    // ==================================================
    // CONTACT
    // ==================================================

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    // ==================================================
    // ADRESSE
    // ==================================================

    address: {
      type: String,
      trim: true,
      default: "",
    },

    city: {
      type: String,
      trim: true,
      default: "",
    },

    postalCode: {
      type: String,
      trim: true,
      default: "",
    },

    country: {
      type: String,
      trim: true,
      default: "France",
    },

    // ==================================================
    // IDENTITÉ VISUELLE
    // ==================================================

    logo: {
      type: String,
      default: "",
      trim: true,
    },

    // ==================================================
    // ABONNEMENT SAAS
    // ==================================================

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

    status: {
      type: String,
      enum: [
        "active",
        "suspended",
        "cancelled",
      ],
      default: "active",
      index: true,
    },

    // ==================================================
    // ÉTAT GLOBAL DE L'ÉGLISE
    // ==================================================

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ==================================================
    // INFORMATIONS COMPLÉMENTAIRES
    // ==================================================

    description: {
      type: String,
      trim: true,
      default: "",
    },

    timezone: {
      type: String,
      default: "Europe/Paris",
      trim: true,
    },

    // ==================================================
    // ABONNEMENT - DATES
    // ==================================================

    subscriptionStartedAt: {
      type: Date,
      default: Date.now,
    },

    subscriptionEndsAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ======================================================
// CRÉATION AUTOMATIQUE DU SLUG
// ======================================================

churchSchema.pre(
  "validate",
  async function (next) {
    try {
      // On ne recrée pas le slug
      // s'il existe déjà et que le nom
      // n'a pas été modifié.

      if (
        this.slug &&
        !this.isModified("name")
      ) {
        return next();
      }

      if (!this.name) {
        return next();
      }

      const baseSlug = this.name
        .toLowerCase()
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-+|-+$/g,
          ""
        );

      let finalSlug = baseSlug;

      let counter = 1;

      // ==================================================
      // ÉVITER LES DOUBLONS
      // ==================================================

      while (true) {
        const existingChurch =
          await mongoose
            .model("Church")
            .findOne({
              slug: finalSlug,

              _id: {
                $ne: this._id,
              },
            })
            .select("_id")
            .lean();

        if (!existingChurch) {
          break;
        }

        counter += 1;

        finalSlug =
          `${baseSlug}-${counter}`;
      }

      this.slug = finalSlug;

      next();
    } catch (error) {
      next(error);
    }
  }
);

// ======================================================
// INDEXES
// ======================================================

churchSchema.index({
  status: 1,
  plan: 1,
});

// ======================================================
// EXPORT
// ======================================================

module.exports =
  mongoose.models.Church ||
  mongoose.model(
    "Church",
    churchSchema
  );