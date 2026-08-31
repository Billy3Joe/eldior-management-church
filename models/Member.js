const mongoose = require("mongoose");

const AGE_GROUPS = [
  "0-3",
  "4-6",
  "7-10",
  "11-14",
  "15-17",
  "18+",
  "Non renseigné",
];

const memberSchema = new mongoose.Schema(
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
    // IDENTITÉ
    // ==================================================

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

    birthDate: {
      type: Date,
      default: null,
    },

    // Utilisé comme valeur manuelle de secours
    // lorsque la date de naissance n'est pas connue.
    ageGroup: {
      type: String,
      enum: AGE_GROUPS,
      default: "Non renseigné",
    },

    // ==================================================
    // CONTACT
    // ==================================================

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

    // ==================================================
    // ORGANISATION
    // ==================================================

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

    // ==================================================
    // MEMBRE / VISITEUR
    // ==================================================

    membershipType: {
      type: String,
      enum: ["Membre", "Visiteur"],
      default: "Membre",
      index: true,
    },

    membershipDate: {
      type: Date,
      default: null,
    },

    // ==================================================
    // HISTORIQUE VISITEUR -> MEMBRE
    // ==================================================

    /*
     * false :
     * personne créée directement comme membre
     *
     * true :
     * personne ayant d'abord été visiteur
     * puis éventuellement intégrée comme membre
     */
    wasVisitor: {
      type: Boolean,
      default: false,
      index: true,
    },

    /*
     * Date à laquelle un ancien visiteur
     * est devenu membre.
     */
    integratedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // ==================================================
    // HISTORIQUE DES VISITES
    // ==================================================

    firstVisitDate: {
      type: Date,
      default: null,
      index: true,
    },

    lastVisitDate: {
      type: Date,
      default: null,
    },

    visitCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==================================================
    // SUIVI DES NOUVELLES PERSONNES
    // ==================================================

    followUpStatus: {
      type: String,

      enum: [
        "Non commencé",
        "À contacter",
        "Contacté",
        "En suivi",
        "Intégré",
        "Clôturé",
      ],

      default: "Intégré",
      index: true,
    },

    followUpAssignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    followUpNote: {
      type: String,
      default: "",
      trim: true,
    },

    lastContactDate: {
      type: Date,
      default: null,
    },

    nextFollowUpDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ======================================================
// INDEXES
// ======================================================

memberSchema.index({
  church: 1,
  firstName: 1,
  lastName: 1,
});

memberSchema.index({
  church: 1,
  membershipType: 1,
  firstVisitDate: -1,
});

memberSchema.index({
  church: 1,
  followUpStatus: 1,
});

memberSchema.index({
  church: 1,
  wasVisitor: 1,
  integratedAt: -1,
});

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "Member",
  memberSchema
);