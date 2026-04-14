const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    leader: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["Actif", "Inactif"],
      default: "Actif",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Department", departmentSchema);