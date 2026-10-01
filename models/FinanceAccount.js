const mongoose = require("mongoose");

const financeAccountSchema = new mongoose.Schema(
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
    // IDENTITÉ DU COMPTE
    // ======================================================

    name: {
      type: String,
      required: [
        true,
        "Le nom du compte est obligatoire.",
      ],
      trim: true,
      maxlength: [
        120,
        "Le nom du compte ne peut pas dépasser 120 caractères.",
      ],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        500,
        "La description ne peut pas dépasser 500 caractères.",
      ],
    },

    // ======================================================
    // TYPE DE COMPTE
    // ======================================================

    type: {
      type: String,
      enum: {
        values: [
          "cash",
          "bank",
          "mobile_money",
          "card",
          "online",
          "other",
        ],
        message:
          "Type de compte financier invalide.",
      },
      required: [
        true,
        "Le type de compte est obligatoire.",
      ],
      index: true,
    },

    // ======================================================
    // INFORMATIONS FINANCIÈRES
    // ======================================================

    currency: {
      type: String,
      required: [
        true,
        "La devise du compte est obligatoire.",
      ],
      trim: true,
      uppercase: true,
      minlength: [
        3,
        "La devise doit contenir 3 caractères.",
      ],
      maxlength: [
        3,
        "La devise doit contenir 3 caractères.",
      ],
      default: "EUR",
    },

    openingBalance: {
      type: Number,
      default: 0,
    },

    currentBalance: {
      type: Number,
      default: 0,
    },

    // ======================================================
    // POLITIQUE DE SOLDE
    // ======================================================

    /**
     * Détermine si le compte peut avoir un solde négatif.
     *
     * false :
     * une dépense ou un transfert sortant sera refusé
     * si le solde disponible est insuffisant.
     *
     * true :
     * le compte peut descendre sous zéro.
     *
     * Exemple :
     * - caisse physique : false
     * - compte bancaire avec découvert autorisé : true
     */
    allowNegativeBalance: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ======================================================
    // INFORMATIONS COMPLÉMENTAIRES
    // ======================================================

    reference: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    bankName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },

    accountNumberMasked: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
    },

    mobileProvider: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
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

    isDefault: {
      type: Boolean,
      default: false,
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

financeAccountSchema.index(
  {
    church: 1,
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

financeAccountSchema.index({
  church: 1,
  isActive: 1,
  sortOrder: 1,
});

financeAccountSchema.index({
  church: 1,
  type: 1,
  isActive: 1,
});

// ======================================================
// NORMALISATION
// ======================================================

financeAccountSchema.pre(
  "validate",
  function () {
    if (typeof this.name === "string") {
      this.name = this.name
        .trim()
        .replace(/\s+/g, " ");
    }

    if (
      typeof this.description === "string"
    ) {
      this.description =
        this.description.trim();
    }

    if (typeof this.currency === "string") {
      this.currency = this.currency
        .trim()
        .toUpperCase();
    }

    if (typeof this.reference === "string") {
      this.reference =
        this.reference.trim();
    }

    if (typeof this.bankName === "string") {
      this.bankName =
        this.bankName.trim();
    }

    if (
      typeof this.accountNumberMasked ===
      "string"
    ) {
      this.accountNumberMasked =
        this.accountNumberMasked.trim();
    }

    if (
      typeof this.mobileProvider === "string"
    ) {
      this.mobileProvider =
        this.mobileProvider.trim();
    }

    if (typeof this.color === "string") {
      this.color = this.color.trim();
    }

    if (typeof this.icon === "string") {
      this.icon = this.icon.trim();
    }
  }
);

// ======================================================
// INITIALISATION DU SOLDE
// ======================================================

financeAccountSchema.pre(
  "save",
  function () {
    if (this.isNew) {
      this.currentBalance =
        this.openingBalance || 0;
    }
  }
);

// ======================================================
// MÉTHODES MÉTIER
// ======================================================

/**
 * Vérifie si le compte dispose d'un solde suffisant
 * pour une sortie financière.
 *
 * Un compte autorisant les soldes négatifs est
 * automatiquement considéré comme pouvant effectuer
 * la sortie.
 */
financeAccountSchema.methods.hasSufficientBalance =
  function (amount) {
    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return false;
    }

    if (this.allowNegativeBalance === true) {
      return true;
    }

    const balance =
      Number(this.currentBalance) || 0;

    return balance >= numericAmount;
  };

/**
 * Calcule le solde qui résulterait d'une sortie.
 */
financeAccountSchema.methods.getBalanceAfterDebit =
  function (amount) {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
      return Number(this.currentBalance) || 0;
    }

    return (
      Math.round(
        ((Number(this.currentBalance) || 0) -
          numericAmount +
          Number.EPSILON) *
          100
      ) / 100
    );
  };

// ======================================================
// PROTECTION COMPTE SYSTÈME
// ======================================================

financeAccountSchema.methods.canBeDeleted =
  function () {
    return this.isSystem !== true;
  };

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "FinanceAccount",
  financeAccountSchema
);