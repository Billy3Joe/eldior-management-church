const mongoose = require("mongoose");

const financeTransactionSchema = new mongoose.Schema(
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
    // TYPE DE MOUVEMENT
    // ======================================================

    type: {
      type: String,
      enum: {
        values: ["income", "expense", "transfer"],
        message:
          "Le type de transaction doit être « income », « expense » ou « transfer ».",
      },
      required: [true, "Le type de transaction est obligatoire."],
      index: true,
    },

    // ======================================================
    // MONTANT
    // ======================================================

    amount: {
      type: Number,
      required: [true, "Le montant est obligatoire."],
      min: [0.01, "Le montant doit être supérieur à zéro."],
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
    // DATE
    // ======================================================

    transactionDate: {
      type: Date,
      required: [true, "La date de transaction est obligatoire."],
      default: Date.now,
      index: true,
    },

    // ======================================================
    // CATÉGORIE
    // ======================================================

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceCategory",
      default: null,
      index: true,
    },

    // ======================================================
    // COMPTE FINANCIER
    // ======================================================

    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceAccount",
      default: null,
      index: true,
    },

    // ======================================================
    // TRANSFERT ENTRE COMPTES
    // ======================================================

    fromAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceAccount",
      default: null,
      index: true,
    },

    toAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceAccount",
      default: null,
      index: true,
    },

    // ======================================================
    // LIEN AVEC UNE PERSONNE
    // ======================================================

    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
      index: true,
    },

    donorName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },

    isAnonymous: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ======================================================
    // INFORMATIONS SUR LA TRANSACTION
    // ======================================================

    title: {
      type: String,
      trim: true,
      required: [true, "Le libellé de la transaction est obligatoire."],
      maxlength: [180, "Le libellé ne peut pas dépasser 180 caractères."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "La description ne peut pas dépasser 1000 caractères."],
    },

    reference: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: {
        values: [
          "cash",
          "bank_transfer",
          "card",
          "mobile_money",
          "check",
          "online",
          "other",
        ],
        message: "Moyen de paiement invalide.",
      },
      default: "cash",
      index: true,
    },

    // ======================================================
    // STATUT
    // ======================================================

    status: {
      type: String,
      enum: {
        values: ["draft", "confirmed", "cancelled"],
        message:
          "Le statut doit être « draft », « confirmed » ou « cancelled ».",
      },
      default: "confirmed",
      index: true,
    },

    // ======================================================
    // JUSTIFICATIF
    // ======================================================

    receiptNumber: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
      index: true,
    },

    attachmentUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    // ======================================================
    // NOTES INTERNES
    // ======================================================

    note: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    // ======================================================
    // ANNULATION
    // ======================================================

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
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

financeTransactionSchema.index({
  church: 1,
  transactionDate: -1,
});

financeTransactionSchema.index({
  church: 1,
  type: 1,
  transactionDate: -1,
});

financeTransactionSchema.index({
  church: 1,
  status: 1,
  transactionDate: -1,
});

financeTransactionSchema.index({
  church: 1,
  category: 1,
  transactionDate: -1,
});

financeTransactionSchema.index({
  church: 1,
  account: 1,
  transactionDate: -1,
});

financeTransactionSchema.index({
  church: 1,
  member: 1,
  transactionDate: -1,
});

financeTransactionSchema.index({
  church: 1,
  paymentMethod: 1,
  transactionDate: -1,
});

// Référence unique lorsqu'elle est renseignée.
financeTransactionSchema.index(
  {
    church: 1,
    reference: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      reference: {
        $type: "string",
        $gt: "",
      },
    },
  }
);

// Numéro de reçu unique lorsqu'il est renseigné.
financeTransactionSchema.index(
  {
    church: 1,
    receiptNumber: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      receiptNumber: {
        $type: "string",
        $gt: "",
      },
    },
  }
);

// ======================================================
// NORMALISATION
// ======================================================

financeTransactionSchema.pre("validate", function () {
  if (typeof this.currency === "string") {
    this.currency = this.currency.trim().toUpperCase();
  }

  if (typeof this.title === "string") {
    this.title = this.title.trim().replace(/\s+/g, " ");
  }

  if (typeof this.description === "string") {
    this.description = this.description.trim();
  }

  if (typeof this.reference === "string") {
    this.reference = this.reference.trim();
  }

  if (typeof this.receiptNumber === "string") {
    this.receiptNumber = this.receiptNumber.trim();
  }

  if (typeof this.donorName === "string") {
    this.donorName = this.donorName.trim().replace(/\s+/g, " ");
  }

  if (typeof this.note === "string") {
    this.note = this.note.trim();
  }

  if (typeof this.cancellationReason === "string") {
    this.cancellationReason = this.cancellationReason.trim();
  }
});

// ======================================================
// VALIDATIONS MÉTIER
// ======================================================

financeTransactionSchema.pre("validate", function () {
  // ------------------------------------------------------
  // REVENUS / DÉPENSES
  // ------------------------------------------------------

  if (this.type === "income" || this.type === "expense") {
    if (!this.account) {
      throw new Error(
        "Un compte financier est obligatoire pour une entrée ou une dépense."
      );
    }

    if (!this.category) {
      throw new Error(
        "Une catégorie financière est obligatoire pour une entrée ou une dépense."
      );
    }

    this.fromAccount = null;
    this.toAccount = null;
  }

  // ------------------------------------------------------
  // TRANSFERTS
  // ------------------------------------------------------

  if (this.type === "transfer") {
    if (!this.fromAccount || !this.toAccount) {
      throw new Error(
        "Les comptes source et destination sont obligatoires pour un transfert."
      );
    }

    if (
      String(this.fromAccount) ===
      String(this.toAccount)
    ) {
      throw new Error(
        "Le compte source et le compte destination doivent être différents."
      );
    }

    this.account = null;
    this.category = null;
    this.member = null;
    this.donorName = "";
    this.isAnonymous = false;
  }

  // ------------------------------------------------------
  // DON ANONYME
  // ------------------------------------------------------

  if (this.isAnonymous === true) {
    this.member = null;
    this.donorName = "";
  }

  // ------------------------------------------------------
  // ANNULATION
  // ------------------------------------------------------

  if (this.status === "cancelled") {
    if (!this.cancelledAt) {
      this.cancelledAt = new Date();
    }
  } else {
    this.cancelledAt = null;
    this.cancelledBy = null;
    this.cancellationReason = "";
  }
});

// ======================================================
// MÉTHODES
// ======================================================

financeTransactionSchema.methods.isConfirmed =
  function () {
    return this.status === "confirmed";
  };

financeTransactionSchema.methods.isCancelled =
  function () {
    return this.status === "cancelled";
  };

financeTransactionSchema.methods.isIncome =
  function () {
    return this.type === "income";
  };

financeTransactionSchema.methods.isExpense =
  function () {
    return this.type === "expense";
  };

financeTransactionSchema.methods.isTransfer =
  function () {
    return this.type === "transfer";
  };

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "FinanceTransaction",
  financeTransactionSchema
);