
const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    // ÉGLISE / TENANT
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
      index: true,
    },

    // INFORMATIONS
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
      index: true,
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

    // CULTE DU DIMANCHE
    isSundayService: {
      type: Boolean,
      default: false,
      index: true,
    },

    // CLÔTURE DES POINTAGES
    attendanceClosed: {
      type: Boolean,
      default: false,
      index: true,
    },

    attendanceClosedAt: {
      type: Date,
      default: null,
    },

    attendanceClosedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    attendanceRevision: {
      type: Number,
      default: 0,
      min: 0,
    },

    // STATUT DE L'ÉVÉNEMENT
    status: {
      type: String,
      enum: [
        "À venir",
        "En cours",
        "Terminé",
        "Annulé",
        "planned",
        "ongoing",
        "completed",
        "cancelled",
      ],
      default: "À venir",
    },
  },
  {
    timestamps: true,
  }
);

// INDEXES
eventSchema.index({
  church: 1,
  date: 1,
});

eventSchema.index({
  church: 1,
  isSundayService: 1,
  date: -1,
});

eventSchema.index({
  church: 1,
  isSundayService: 1,
  attendanceClosed: 1,
  date: -1,
});

// EXPORT
module.exports = mongoose.model(
  "Event",
  eventSchema
);
