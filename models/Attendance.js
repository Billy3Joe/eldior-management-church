const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    // ==================================================
    // ÉGLISE / TENANT
    // ==================================================

    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
      index: true,
    },

    // ==================================================
    // PRÉSENCE
    // ==================================================

    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "Présent",
        "Absent",
        "Excusé",
        "En retard",
      ],
      default: "Présent",
    },

    note: {
      type: String,
      default: "",
      trim: true,
    },

    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    markedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Empêche deux présences pour le même membre
// et le même événement dans une même église.
attendanceSchema.index(
  {
    church: 1,
    member: 1,
    event: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "Attendance",
  attendanceSchema
);