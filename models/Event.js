const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      default: "Autre",
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },

    location: {
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
      enum: [
        "À venir",
        "En cours",
        "Terminé",
        "Annulé",
      ],
      default: "À venir",
    },
  },
  {
    timestamps: true,
  }
);

eventSchema.index({
  church: 1,
  date: 1,
});

module.exports = mongoose.model(
  "Event",
  eventSchema
);