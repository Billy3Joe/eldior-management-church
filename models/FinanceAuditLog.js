
const mongoose = require("mongoose");

const financeAuditLogSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      required: true,
      immutable: true,
      index: true,
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      immutable: true,
    },

    action: {
      type: String,
      enum: [
        "create",
        "update",
        "confirm",
        "reactivate",
        "cancel",
        "delete",
      ],
      required: true,
      immutable: true,
    },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },

    // État avant l'opération :
    // conservé sans modification.
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      immutable: true,
    },

    // État après l'opération :
    // doit pouvoir être renseigné lorsque
    // l'opération est terminée.
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    outcome: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
      required: true,
    },

    errorMessage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ======================================================
// INDEX POUR L'HISTORIQUE FINANCIER
// ======================================================

financeAuditLogSchema.index({
  church: 1,
  createdAt: -1,
});

financeAuditLogSchema.index({
  church: 1,
  transactionId: 1,
  createdAt: -1,
});

financeAuditLogSchema.index({
  church: 1,
  actor: 1,
  createdAt: -1,
});

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "FinanceAuditLog",
  financeAuditLogSchema
);
