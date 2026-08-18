const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["Culte", "Réunion", "Conférence", "Répétition", "Veillée", "Autre"],
      default: "Autre",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    date: {
      type: Date,
      required: true,
    },
    location: {
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
      enum: ["Prévu", "Terminé", "Annulé"],
      default: "Prévu",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);