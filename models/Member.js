const mongoose = require("mongoose");

// ======================================================
// TRANCHES D'ÂGE
// ======================================================

const AGE_GROUPS = [
  "0-3",
  "4-6",
  "7-10",
  "11-14",
  "15-17",
  "18+",
  "Non renseigné",
];

// ======================================================
// RELATIONS FAMILIALES
// ======================================================

const FAMILY_RELATIONSHIPS = [
  "Père",
  "Mère",
  "Conjoint(e)",
  "Enfant",
  "Tuteur",
  "Responsable du foyer",
  "Autre",
  "",
];

// ======================================================
// ÉTAPES DU PARCOURS SPIRITUEL
// ======================================================

const SPIRITUAL_STAGES = [
  "Visiteur",
  "Nouveau",
  "Suivi",
  "Intégration",
  "Membre",
  "Baptisé",
  "Formation",
  "Serviteur",
  "Responsable",
];

// ======================================================
// HISTORIQUE DU PARCOURS SPIRITUEL
// ======================================================

const spiritualJourneyHistorySchema =
  new mongoose.Schema(
    {
      stage: {
        type: String,
        enum: SPIRITUAL_STAGES,
        required: true,
      },

      enteredAt: {
        type: Date,
        default: Date.now,
      },

      exitedAt: {
        type: Date,
        default: null,
      },

      note: {
        type: String,
        default: "",
        trim: true,
      },

      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    {
      _id: true,
    }
  );

// ======================================================
// SCHÉMA MEMBRE
// ======================================================

const memberSchema =
  new mongoose.Schema(
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
        enum: [
          "Homme",
          "Femme",
          "",
        ],
        default: "",
      },

      birthDate: {
        type: Date,
        default: null,
      },

      /*
       * Utilisé comme valeur manuelle de secours
       * lorsque la date de naissance n'est pas connue.
       */
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
        enum: [
          "Actif",
          "Inactif",
        ],
        default: "Actif",
      },

      // ==================================================
      // FAMILLE
      // ==================================================

      family: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Family",
        default: null,
        index: true,
      },

      familyRole: {
        type: String,
        enum: FAMILY_RELATIONSHIPS,
        default: "",
      },

      // ==================================================
      // MEMBRE / VISITEUR
      // ==================================================

      membershipType: {
        type: String,
        enum: [
          "Membre",
          "Visiteur",
        ],
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

      /**
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

      /**
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

      // ==================================================
      // PARCOURS SPIRITUEL / INTÉGRATION
      // ==================================================

      /**
       * Étape actuelle de la personne dans son
       * parcours d'intégration et de développement.
       *
       * Visiteur
       * ↓
       * Nouveau
       * ↓
       * Suivi
       * ↓
       * Intégration
       * ↓
       * Membre
       * ↓
       * Baptisé
       * ↓
       * Formation
       * ↓
       * Serviteur
       * ↓
       * Responsable
       */
      spiritualStage: {
        type: String,
        enum: SPIRITUAL_STAGES,

        default: function () {
          return this.membershipType ===
            "Visiteur"
            ? "Visiteur"
            : "Membre";
        },

        index: true,
      },

      /**
       * Date depuis laquelle la personne
       * se trouve dans son étape actuelle.
       */
      spiritualStageSince: {
        type: Date,
        default: Date.now,
        index: true,
      },

      /**
       * Historique complet des différentes étapes.
       *
       * On ne supprime jamais les anciennes étapes.
       * Elles permettent de reconstruire tout le parcours.
       */
      spiritualJourneyHistory: {
        type: [
          spiritualJourneyHistorySchema,
        ],
        default: [],
      },

      /**
       * Note générale concernant le parcours
       * spirituel ou d'intégration.
       */
      spiritualJourneyNote: {
        type: String,
        default: "",
        trim: true,
      },

      /**
       * Personne actuellement responsable
       * de l'accompagnement spirituel.
       */
      spiritualMentor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      /**
       * Date du prochain point prévu concernant
       * le parcours de la personne.
       */
      nextSpiritualFollowUpDate: {
        type: Date,
        default: null,
        index: true,
      },
    },
    {
      timestamps: true,
    }
  );

// ======================================================
// INDEXES
// ======================================================

// Recherche par personne
memberSchema.index({
  church: 1,
  firstName: 1,
  lastName: 1,
});

// Visiteurs
memberSchema.index({
  church: 1,
  membershipType: 1,
  firstVisitDate: -1,
});

// Suivi pastoral
memberSchema.index({
  church: 1,
  followUpStatus: 1,
});

// Anciens visiteurs intégrés
memberSchema.index({
  church: 1,
  wasVisitor: 1,
  integratedAt: -1,
});

// Familles
memberSchema.index({
  church: 1,
  family: 1,
});

memberSchema.index({
  church: 1,
  familyRole: 1,
});

// Parcours spirituel
memberSchema.index({
  church: 1,
  spiritualStage: 1,
});

memberSchema.index({
  church: 1,
  spiritualStage: 1,
  spiritualStageSince: 1,
});

// Prochain accompagnement spirituel
memberSchema.index({
  church: 1,
  nextSpiritualFollowUpDate: 1,
});

// ======================================================
// EXPORTS
// ======================================================

const Member =
  mongoose.model(
    "Member",
    memberSchema
  );

module.exports = Member;

// Constantes éventuellement réutilisables
module.exports.AGE_GROUPS =
  AGE_GROUPS;

module.exports.FAMILY_RELATIONSHIPS =
  FAMILY_RELATIONSHIPS;

module.exports.SPIRITUAL_STAGES =
  SPIRITUAL_STAGES;