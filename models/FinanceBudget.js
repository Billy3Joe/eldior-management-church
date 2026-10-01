const mongoose = require("mongoose");

const financeBudgetSchema = new mongoose.Schema(
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
      required: [true, "Le nom du budget est obligatoire."],
      trim: true,
      maxlength: [150, "Le nom du budget ne peut pas dépasser 150 caractères."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "La description ne peut pas dépasser 1000 caractères."],
    },

    // ======================================================
    // PÉRIODE
    // ======================================================

    periodType: {
      type: String,
      enum: {
        values: ["monthly", "quarterly", "yearly", "custom"],
        message:
          "La période doit être « monthly », « quarterly », « yearly » ou « custom ».",
      },
      required: [true, "Le type de période est obligatoire."],
      index: true,
    },

    startDate: {
      type: Date,
      required: [true, "La date de début du budget est obligatoire."],
      index: true,
    },

    endDate: {
      type: Date,
      required: [true, "La date de fin du budget est obligatoire."],
      index: true,
    },

    // ======================================================
    // MONTANTS
    // ======================================================

    amount: {
      type: Number,
      required: [true, "Le montant du budget est obligatoire."],
      min: [0, "Le montant du budget ne peut pas être négatif."],
    },

    currency: {
      type: String,
      required: [true, "La devise est obligatoire."],
      trim: true,
      uppercase: true,
      minlength: [3, "La devise doit contenir 3 caractères."],
      maxlength: [3, "La devise doit contenir 3 caractères."],
      default: "EUR",
    },

    // ======================================================
    // CIBLAGE DU BUDGET
    // ======================================================

    scopeType: {
      type: String,
      enum: {
        values: ["global", "category", "department"],
        message:
          "Le périmètre doit être « global », « category » ou « department ».",
      },
      default: "global",
      required: true,
      index: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceCategory",
      default: null,
      index: true,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },

    // ======================================================
    // TYPE DE BUDGET
    // ======================================================

    budgetType: {
      type: String,
      enum: {
        values: ["expense", "income"],
        message:
          "Le type de budget doit être « expense » ou « income ».",
      },
      default: "expense",
      required: true,
      index: true,
    },

    // ======================================================
    // ALERTES
    // ======================================================

    warningThresholdPercent: {
      type: Number,
      default: 80,
      min: [1, "Le seuil doit être supérieur à 0."],
      max: [100, "Le seuil ne peut pas dépasser 100."],
    },

    enableAlerts: {
      type: Boolean,
      default: true,
    },

    // ======================================================
    // STATUT
    // ======================================================

    status: {
      type: String,
      enum: {
        values: ["draft", "active", "closed", "cancelled"],
        message:
          "Le statut doit être « draft », « active », « closed » ou « cancelled ».",
      },
      default: "active",
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ======================================================
    // NOTES
    // ======================================================

    note: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    // ======================================================
    // AUDIT
    // ======================================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
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

financeBudgetSchema.index({
  church: 1,
  status: 1,
  startDate: 1,
  endDate: 1,
});

financeBudgetSchema.index({
  church: 1,
  scopeType: 1,
  startDate: 1,
  endDate: 1,
});

financeBudgetSchema.index({
  church: 1,
  budgetType: 1,
  startDate: 1,
  endDate: 1,
});

financeBudgetSchema.index({
  church: 1,
  category: 1,
  startDate: 1,
  endDate: 1,
});

financeBudgetSchema.index({
  church: 1,
  department: 1,
  startDate: 1,
  endDate: 1,
});

// ======================================================
// NORMALISATION
// ======================================================

financeBudgetSchema.pre("validate", function () {
  if (typeof this.name === "string") {
    this.name = this.name.trim().replace(/\s+/g, " ");
  }

  if (typeof this.description === "string") {
    this.description = this.description.trim();
  }

  if (typeof this.currency === "string") {
    this.currency = this.currency.trim().toUpperCase();
  }

  if (typeof this.note === "string") {
    this.note = this.note.trim();
  }
});

// ======================================================
// VALIDATIONS MÉTIER
// ======================================================

financeBudgetSchema.pre("validate", function () {
  if (
    this.startDate &&
    this.endDate &&
    new Date(this.endDate) < new Date(this.startDate)
  ) {
    throw new Error(
      "La date de fin du budget doit être postérieure à la date de début."
    );
  }

  if (this.scopeType === "global") {
    this.category = null;
    this.department = null;
  }

  if (this.scopeType === "category") {
    if (!this.category) {
      throw new Error(
        "Une catégorie financière est obligatoire pour un budget par catégorie."
      );
    }

    this.department = null;
  }

  if (this.scopeType === "department") {
    if (!this.department) {
      throw new Error(
        "Un département est obligatoire pour un budget par département."
      );
    }

    this.category = null;
  }
});

// ======================================================
// MÉTHODES
// ======================================================

financeBudgetSchema.methods.isCurrentlyActive = function () {
  const now = new Date();

  return (
    this.status === "active" &&
    this.isActive === true &&
    now >= this.startDate &&
    now <= this.endDate
  );
};

financeBudgetSchema.methods.getWarningAmount = function () {
  return (
    this.amount *
    (this.warningThresholdPercent / 100)
  );
};

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "FinanceBudget",
  financeBudgetSchema
);