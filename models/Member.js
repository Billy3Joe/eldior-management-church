const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
      index: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    gender: {
      type: String,
      enum: ["Homme", "Femme", ""],
      default: "",
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },

    address: {
      type: String,
      default: "",
      trim: true,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    status: {
      type: String,
      enum: ["Actif", "Inactif"],
      default: "Actif",
    },
  },
  {
    timestamps: true,
  }
);

memberSchema.index({
  church: 1,
  firstName: 1,
  lastName: 1,
});

module.exports = mongoose.model(
  "Member",
  memberSchema
);