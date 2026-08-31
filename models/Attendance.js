const mongoose = require("mongoose");

// ======================================================
// CONSTANTES
// ======================================================

const ATTENDANCE_STATUSES = [
  "Présent",
  "Absent",
  "Excusé",
  "En retard",
];

const AGE_GROUPS = [
  "0-3",
  "4-6",
  "7-10",
  "11-14",
  "15-17",
  "18+",
  "Non renseigné",
];

const MEMBERSHIP_TYPES = [
  "Membre",
  "Visiteur",
];

// ======================================================
// SCHÉMA
// ======================================================

const attendanceSchema = new mongoose.Schema(
  {
    // ==================================================
    // ÉGLISE / TENANT
    // ==================================================

    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      required: true,
      index: true,
    },

    // ==================================================
    // MEMBRE
    // ==================================================

    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },

    // ==================================================
    // ÉVÉNEMENT
    // ==================================================

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    // ==================================================
    // STATUT DE PRÉSENCE
    // ==================================================

    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: "Présent",
      required: true,
      index: true,
    },

    note: {
      type: String,
      default: "",
      trim: true,
    },

    // ==================================================
    // PREMIÈRE VISITE
    // ==================================================

    isFirstVisit: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ==================================================
    // SNAPSHOT DÉMOGRAPHIQUE
    //
    // On conserve les informations telles qu'elles
    // étaient au moment de l'événement.
    // ==================================================

    ageAtEvent: {
      type: Number,
      default: null,
      min: 0,
    },

    ageGroupSnapshot: {
      type: String,
      enum: AGE_GROUPS,
      default: "Non renseigné",
    },

    genderSnapshot: {
      type: String,
      enum: [
        "Homme",
        "Femme",
        "",
      ],
      default: "",
    },

    membershipTypeSnapshot: {
      type: String,
      enum: MEMBERSHIP_TYPES,
      default: "Membre",
    },

    // ==================================================
    // POINTAGE
    // ==================================================

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

// ======================================================
// INDEX UNIQUE
//
// Une personne ne peut avoir qu'UNE ligne de présence
// pour UN événement dans UNE église.
//
// Exemple autorisé :
// Paul + Culte dimanche
// Jean + Culte dimanche
//
// Exemple interdit :
// Paul + Culte dimanche
// Paul + Culte dimanche une deuxième fois
// ======================================================

attendanceSchema.index(
  {
    church: 1,
    member: 1,
    event: 1,
  },
  {
    unique: true,
    name: "unique_church_member_event",
  }
);

// ======================================================
// INDEX POUR LES RECHERCHES
// ======================================================

attendanceSchema.index({
  church: 1,
  event: 1,
  status: 1,
});

attendanceSchema.index({
  church: 1,
  member: 1,
  markedAt: -1,
});

attendanceSchema.index({
  church: 1,
  isFirstVisit: 1,
});

attendanceSchema.index({
  church: 1,
  createdAt: -1,
});

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "Attendance",
  attendanceSchema
);