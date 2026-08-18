const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
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

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    role: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "declined", "cancelled"],
      default: "pending",
    },

    note: {
      type: String,
      trim: true,
      default: "",
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    declinedAt: {
      type: Date,
      default: null,
    },

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

// Empêche de programmer deux fois
// la même personne au même événement pour le même rôle.
assignmentSchema.index(
  {
    member: 1,
    event: 1,
    role: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model("Assignment", assignmentSchema);