const mongoose =
  require("mongoose");

// ======================================================
// CONSTANTES
// ======================================================

const DEPARTMENT_STATUSES = [
  "active",
  "inactive",
];

const DEPARTMENT_MEMBER_ROLES = [
  "Membre",
  "Responsable",
  "Responsable adjoint",
  "Coordinateur",
  "Assistant",
  "Serviteur",
  "Bénévole",
  "Autre",
];

// ======================================================
// SOUS-SCHÉMA : MEMBRE DU DÉPARTEMENT
// ======================================================

const departmentMemberSchema =
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

        enum:
          DEPARTMENT_MEMBER_ROLES,

        default:
          "Membre",

        trim: true,
      },

      responsibility: {
        type: String,

        default: "",

        trim: true,
      },

      joinedAt: {
        type: Date,

        default:
          Date.now,
      },

      leftAt: {
        type: Date,

        default: null,
      },

      note: {
        type: String,

        default: "",

        trim: true,
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
// SCHÉMA PRINCIPAL
// ======================================================

const departmentSchema =
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

        required: true,

        trim: true,

        maxlength: 150,
      },

      description: {
        type: String,

        default: "",

        trim: true,
      },

      status: {
        type: String,

        enum:
          DEPARTMENT_STATUSES,

        default:
          "active",

        index: true,
      },

      // ==================================================
      // RESPONSABLE PRINCIPAL
      // ==================================================

      leader: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Member",

        default: null,
      },

      // ==================================================
      // RESPONSABLES ADJOINTS
      // ==================================================

      assistantLeaders: [
        {
          type:
            mongoose.Schema.Types
              .ObjectId,

          ref: "Member",
        },
      ],

      // ==================================================
      // MEMBRES / SERVITEURS
      // ==================================================

      members: {
        type: [
          departmentMemberSchema,
        ],

        default: [],
      },

      // ==================================================
      // INFORMATIONS COMPLÉMENTAIRES
      // ==================================================

      meetingDay: {
        type: String,

        default: "",

        trim: true,
      },

      meetingTime: {
        type: String,

        default: "",

        trim: true,
      },

      location: {
        type: String,

        default: "",

        trim: true,
      },

      color: {
        type: String,

        default: "",

        trim: true,
      },

      icon: {
        type: String,

        default: "",

        trim: true,
      },

      notes: {
        type: String,

        default: "",

        trim: true,
      },

      // ==================================================
      // TRAÇABILITÉ
      // ==================================================

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
// VALIDATION
// ======================================================

departmentSchema.pre(
  "validate",

  function () {
    // --------------------------------------------------
    // Pas de doublon dans les membres
    // --------------------------------------------------

    const memberIds =
      this.members
        .filter(
          (entry) =>
            entry.member
        )
        .map(
          (entry) =>
            entry.member.toString()
        );

    const uniqueMemberIds =
      new Set(
        memberIds
      );

    if (
      uniqueMemberIds.size !==
      memberIds.length
    ) {
      throw new Error(
        "Une personne ne peut apparaître qu'une seule fois dans un département."
      );
    }

    // --------------------------------------------------
    // Pas de doublon dans les responsables adjoints
    // --------------------------------------------------

    const assistantIds =
      (
        this.assistantLeaders ||
        []
      )
        .filter(Boolean)
        .map(
          (memberId) =>
            memberId.toString()
        );

    const uniqueAssistantIds =
      new Set(
        assistantIds
      );

    if (
      uniqueAssistantIds.size !==
      assistantIds.length
    ) {
      throw new Error(
        "Un responsable adjoint ne peut apparaître plusieurs fois."
      );
    }

    // --------------------------------------------------
    // Le responsable principal ne peut pas également
    // être responsable adjoint
    // --------------------------------------------------

    if (
      this.leader &&
      assistantIds.includes(
        this.leader.toString()
      )
    ) {
      throw new Error(
        "Le responsable principal ne peut pas également être responsable adjoint."
      );
    }
  }
);

// ======================================================
// VIRTUALS
// ======================================================

departmentSchema.virtual(
  "memberCount"
).get(function () {
  return this.members.filter(
    (entry) =>
      entry.isActive !==
      false
  ).length;
});

// ======================================================
// OPTIONS JSON
// ======================================================

departmentSchema.set(
  "toJSON",
  {
    virtuals: true,
  }
);

departmentSchema.set(
  "toObject",
  {
    virtuals: true,
  }
);

// ======================================================
// INDEXES
// ======================================================

// Un nom de département unique par église.

departmentSchema.index(
  {
    church: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

// Recherche par statut.

departmentSchema.index({
  church: 1,
  status: 1,
});

// Recherche des départements d'une personne.

departmentSchema.index({
  church: 1,
  "members.member": 1,
});

// Recherche par responsable.

departmentSchema.index({
  church: 1,
  leader: 1,
});

// ======================================================
// EXPORTS
// ======================================================

module.exports =
  mongoose.model(
    "Department",
    departmentSchema
  );

module.exports.DEPARTMENT_STATUSES =
  DEPARTMENT_STATUSES;

module.exports.DEPARTMENT_MEMBER_ROLES =
  DEPARTMENT_MEMBER_ROLES;