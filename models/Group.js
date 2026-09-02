const mongoose = require("mongoose");

// ======================================================
// CONSTANTES
// ======================================================

const GROUP_TYPES = [
  "Cellule",
  "Groupe de maison",
  "Groupe de croissance",
  "Groupe de jeunes",
  "Groupe de femmes",
  "Groupe d'hommes",
  "Groupe de prière",
  "Groupe de formation",
  "Autre",
];

const GROUP_STATUSES = [
  "Actif",
  "Inactif",
  "En pause",
];

const MEMBER_ROLES = [
  "Membre",
  "Responsable",
  "Assistant",
  "Hôte",
];

// ======================================================
// SOUS-SCHÉMA MEMBRE DU GROUPE
// ======================================================

const groupMemberSchema =
  new mongoose.Schema(
    {
      member: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Member",

        required: true,
      },

      role: {
        type: String,

        enum: MEMBER_ROLES,

        default: "Membre",

        trim: true,
      },

      joinedAt: {
        type: Date,

        default: Date.now,
      },

      note: {
        type: String,

        trim: true,

        default: "",
      },

      isActive: {
        type: Boolean,

        default: true,
      },
    },
    {
      _id: true,
    }
  );

// ======================================================
// SCHÉMA GROUPE / CELLULE
// ======================================================

const groupSchema =
  new mongoose.Schema(
    {
      church: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Church",

        required: true,

        index: true,
      },

      name: {
        type: String,

        required: [
          true,
          "Le nom du groupe est obligatoire.",
        ],

        trim: true,

        maxlength: 150,
      },

      type: {
        type: String,

        enum: GROUP_TYPES,

        default: "Cellule",

        index: true,
      },

      description: {
        type: String,

        trim: true,

        default: "",
      },

      status: {
        type: String,

        enum: GROUP_STATUSES,

        default: "Actif",

        index: true,
      },

      leader: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Member",

        default: null,

        index: true,
      },

      assistantLeaders: [
        {
          type:
            mongoose.Schema.Types
              .ObjectId,

          ref: "Member",
        },
      ],

      members: {
        type: [
          groupMemberSchema,
        ],

        default: [],
      },

      meetingDay: {
        type: String,

        trim: true,

        default: "",
      },

      meetingTime: {
        type: String,

        trim: true,

        default: "",
      },

      meetingFrequency: {
        type: String,

        enum: [
          "Hebdomadaire",
          "Toutes les 2 semaines",
          "Mensuelle",
          "Occasionnelle",
          "Autre",
          "",
        ],

        default: "Hebdomadaire",
      },

      location: {
        type: String,

        trim: true,

        default: "",
      },

      address: {
        type: String,

        trim: true,

        default: "",
      },

      city: {
        type: String,

        trim: true,

        default: "",
      },

      capacity: {
        type: Number,

        min: 0,

        default: 0,
      },

      startedAt: {
        type: Date,

        default: null,
      },

      notes: {
        type: String,

        trim: true,

        default: "",
      },

      createdBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",

        default: null,
      },

      updatedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",

        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

// ======================================================
// VALIDATION ANTI-DOUBLON
// ======================================================

groupSchema.pre(
  "validate",
  function () {
    const memberIds =
      this.members
        .filter(
          (item) =>
            item.member
        )
        .map(
          (item) =>
            item.member.toString()
        );

    const uniqueIds =
      new Set(memberIds);

    if (
      uniqueIds.size !==
      memberIds.length
    ) {
      throw new Error(
        "Une personne ne peut apparaître qu'une seule fois dans le même groupe."
      );
    }

    const assistants =
      (
        this.assistantLeaders ||
        []
      ).map((id) =>
        id.toString()
      );

    const uniqueAssistants =
      new Set(assistants);

    if (
      uniqueAssistants.size !==
      assistants.length
    ) {
      throw new Error(
        "Un assistant ne peut être ajouté plusieurs fois."
      );
    }

    if (
      this.leader &&
      assistants.includes(
        this.leader.toString()
      )
    ) {
      throw new Error(
        "Le responsable principal ne peut pas également être assistant."
      );
    }
  }
);

// ======================================================
// INDEXES
// ======================================================

groupSchema.index(
  {
    church: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

groupSchema.index({
  church: 1,
  status: 1,
  type: 1,
});

groupSchema.index({
  church: 1,
  "members.member": 1,
});

groupSchema.index({
  church: 1,
  leader: 1,
});

// ======================================================
// EXPORTS
// ======================================================

const Group =
  mongoose.model(
    "Group",
    groupSchema
  );

module.exports = Group;

module.exports.GROUP_TYPES =
  GROUP_TYPES;

module.exports.GROUP_STATUSES =
  GROUP_STATUSES;

module.exports.MEMBER_ROLES =
  MEMBER_ROLES;