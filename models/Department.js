const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    leader: {
      type: String,
      default: "",
      trim: true,
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

departmentSchema.index({
  church: 1,
  name: 1,
});

module.exports = mongoose.model(
  "Department",
  departmentSchema
);