
const mongoose = require("mongoose");

const pastoralScanLockSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      required: true,
    },

    periodKey: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },

    lockedUntil: {
      type: Date,
      required: true,
    },

    owner: {
      type: String,
      required: true,
    },

    acquiredAt: {
      type: Date,
      default: Date.now,
    },

    lastCompletedAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

pastoralScanLockSchema.index(
  { church: 1, periodKey: 1 },
  {
    unique: true,
    name: "unique_pastoral_scan_lock",
  }
);

module.exports =
  mongoose.models.PastoralScanLock ||
  mongoose.model(
    "PastoralScanLock",
    pastoralScanLockSchema
  );
