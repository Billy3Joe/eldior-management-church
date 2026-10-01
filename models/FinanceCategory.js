const mongoose = require("mongoose");

const financeCategorySchema = new mongoose.Schema(
  {
    // ======================================================
    // TENANT / ÉGLISE
    // ======================================================

    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      required: true,
      index: true,
    },

    // ======================================================
    // IDENTITÉ
    // ======================================================

    name: {
      type: String,
      required: [true, "Le nom de la catégorie est obligatoire."],
      trim: true,
      maxlength: [100, "Le nom ne peut pas dépasser 100 caractères."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "La description ne peut pas dépasser 500 caractères."],
    },

    // ======================================================
    // TYPE FINANCIER
    // ======================================================

    type: {
      type: String,
      enum: {
        values: ["income", "expense"],
        message: "Le type doit être « income » ou « expense ».",
      },
      required: [true, "Le type de catégorie est obligatoire."],
      index: true,
    },

    // ======================================================
    // CLASSIFICATION
    // ======================================================

    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      maxlength: [30, "Le code ne peut pas dépasser 30 caractères."],
    },

    // ======================================================
    // AFFICHAGE
    // ======================================================

    color: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },

    icon: {
      type: String,
      trim: true,
      default: "",
      maxlength: 50,
    },

    // ======================================================
    // COMPORTEMENT
    // ======================================================

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isSystem: {
      type: Boolean,
      default: false,
    },

    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ======================================================
    // AUDIT
    // ======================================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
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
// INDEXES
// ======================================================

// Une église ne doit pas avoir deux catégories du même
// type portant exactement le même nom.
financeCategorySchema.index(
  {
    church: 1,
    type: 1,
    name: 1,
  },
  {
    unique: true,
    collation: {
      locale: "fr",
      strength: 2,
    },
  }
);

// Recherche et filtrage fréquent.
financeCategorySchema.index({
  church: 1,
  type: 1,
  isActive: 1,
  sortOrder: 1,
});

// Code optionnel unique par église lorsqu'il est renseigné.
financeCategorySchema.index(
  {
    church: 1,
    code: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      code: {
        $type: "string",
        $gt: "",
      },
    },
  }
);

// ======================================================
// NORMALISATION
// ======================================================

financeCategorySchema.pre("validate", function () {
  if (typeof this.name === "string") {
    this.name = this.name.trim().replace(/\s+/g, " ");
  }

  if (typeof this.description === "string") {
    this.description = this.description.trim();
  }

  if (typeof this.code === "string") {
    this.code = this.code.trim().toUpperCase();
  }

  if (typeof this.color === "string") {
    this.color = this.color.trim();
  }

  if (typeof this.icon === "string") {
    this.icon = this.icon.trim();
  }
});

// ======================================================
// PROTECTION DES CATÉGORIES SYSTÈME
// ======================================================

financeCategorySchema.methods.canBeDeleted = function () {
  return this.isSystem !== true;
};

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "FinanceCategory",
  financeCategorySchema
);