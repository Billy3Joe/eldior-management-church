const mongoose = require("mongoose");

// ======================================================
// TYPES D'ÉVÉNEMENTS
// ======================================================

const PERSON_HISTORY_TYPES = [
  "PERSON_CREATED",

  "FIRST_VISIT",

  "VISITOR_CONTACT",

  "VISITOR_INTEGRATED",

  "MEMBERSHIP_CHANGED",

  "STATUS_CHANGED",

  "SPIRITUAL_STAGE_CHANGED",

  "FAMILY_JOINED",

  "FAMILY_ROLE_CHANGED",

  "FAMILY_LEFT",

  "GROUP_JOINED",

  "GROUP_ROLE_CHANGED",

  "GROUP_LEFT",

  "DEPARTMENT_JOINED",

  "DEPARTMENT_RESPONSIBILITY_CHANGED",

  "DEPARTMENT_LEFT",

  "PASTORAL_ALERT_CREATED",

  "PASTORAL_ALERT_UPDATED",

  "PASTORAL_ALERT_RESOLVED",

  "ATTENDANCE_RECORDED",

  "NOTE_ADDED",

  "OTHER",
];

// ======================================================
// CATÉGORIES
// ======================================================

const PERSON_HISTORY_CATEGORIES = [
  "Identité",

  "Visiteur",

  "Intégration",

  "Parcours spirituel",

  "Famille",

  "Groupe",

  "Département",

  "Responsabilité",

  "Présence",

  "Suivi pastoral",

  "Administration",

  "Autre",
];

// ======================================================
// SCHÉMA
// ======================================================

const personHistorySchema =
  new mongoose.Schema(
    {
      // ==================================================
      // TENANT
      // ==================================================

      church: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Church",

        required: true,

        index: true,
      },

      // ==================================================
      // PERSONNE CONCERNÉE
      // ==================================================

      member: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Member",

        required: true,

        index: true,
      },

      // ==================================================
      // TYPE D'ÉVÉNEMENT
      // ==================================================

      type: {
        type: String,

        enum:
          PERSON_HISTORY_TYPES,

        required: true,

        index: true,
      },

      category: {
        type: String,

        enum:
          PERSON_HISTORY_CATEGORIES,

        default:
          "Autre",

        index: true,
      },

      // ==================================================
      // CONTENU HUMAIN
      // ==================================================

      title: {
        type: String,

        required: true,

        trim: true,

        maxlength: 200,
      },

      description: {
        type: String,

        default: "",

        trim: true,

        maxlength: 2000,
      },

      // ==================================================
      // DATE MÉTIER
      //
      // Ce n'est pas forcément la date de création
      // du document.
      //
      // Exemple :
      // première visite le 30 août,
      // historique généré le 3 septembre.
      // ==================================================

      occurredAt: {
        type: Date,

        default:
          Date.now,

        required: true,

        index: true,
      },

      // ==================================================
      // VALEUR AVANT / APRÈS
      // ==================================================

      previousValue: {
        type: String,

        default: "",

        trim: true,
      },

      newValue: {
        type: String,

        default: "",

        trim: true,
      },

      // ==================================================
      // SOURCE MÉTIER
      // ==================================================

      sourceType: {
        type: String,

        default: "",

        trim: true,

        index: true,
      },

      sourceId: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        default: null,

        index: true,
      },

      // ==================================================
      // CLÉ D'IDEMPOTENCE
      //
      // Permet d'éviter qu'un même événement métier
      // soit enregistré plusieurs fois.
      //
      // Exemples :
      //
      // first-visit:<memberId>
      //
      // attendance:<attendanceId>
      //
      // migration:family:<familyId>:<memberId>
      //
      // null = événement sans contrainte d'idempotence.
      // ==================================================

      dedupeKey: {
        type: String,

        default: null,

        trim: true,
      },

      // ==================================================
      // INFORMATIONS COMPLÉMENTAIRES
      // ==================================================

      metadata: {
        type:
          mongoose.Schema.Types
            .Mixed,

        default: {},
      },

      // ==================================================
      // AUTEUR
      // ==================================================

      createdBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",

        default: null,
      },

      createdByName: {
        type: String,

        default:
          "Système",

        trim: true,
      },

      // ==================================================
      // ORIGINE
      // ==================================================

      origin: {
        type: String,

        enum: [
          "manual",
          "automatic",
          "migration",
          "system",
        ],

        default:
          "automatic",
      },

      // ==================================================
      // VISIBILITÉ
      // ==================================================

      visibility: {
        type: String,

        enum: [
          "standard",
          "pastoral",
          "restricted",
        ],

        default:
          "standard",

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

// Timeline principale d'une personne.

personHistorySchema.index({
  church: 1,
  member: 1,
  occurredAt: -1,
});

// Filtrage par catégorie.

personHistorySchema.index({
  church: 1,
  member: 1,
  category: 1,
  occurredAt: -1,
});

// Filtrage par type.

personHistorySchema.index({
  church: 1,
  member: 1,
  type: 1,
  occurredAt: -1,
});

// Recherche par source métier.

personHistorySchema.index({
  church: 1,
  sourceType: 1,
  sourceId: 1,
});

// ======================================================
// INDEX D'IDEMPOTENCE
//
// IMPORTANT :
// partialFilterExpression permet aux événements
// historiques existants sans dedupeKey de continuer
// à fonctionner normalement.
//
// En revanche, deux événements d'une même église
// ne pourront pas partager la même dedupeKey.
// ======================================================

personHistorySchema.index(
  {
    church: 1,
    dedupeKey: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      dedupeKey: {
        $type: "string",
      },
    },
  }
);

// ======================================================
// JSON
// ======================================================

personHistorySchema.set(
  "toJSON",
  {
    virtuals: true,
  }
);

personHistorySchema.set(
  "toObject",
  {
    virtuals: true,
  }
);

// ======================================================
// EXPORT
// ======================================================

module.exports =
  mongoose.model(
    "PersonHistory",
    personHistorySchema
  );

module.exports.PERSON_HISTORY_TYPES =
  PERSON_HISTORY_TYPES;

module.exports.PERSON_HISTORY_CATEGORIES =
  PERSON_HISTORY_CATEGORIES;