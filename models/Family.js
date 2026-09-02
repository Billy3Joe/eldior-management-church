const mongoose = require("mongoose");

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
];

// ======================================================
// SOUS-SCHÉMA : MEMBRE DU FOYER
// ======================================================

const familyMemberSchema =
  new mongoose.Schema(
    {
      member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        required: true,
      },

      relationship: {
        type: String,
        enum: FAMILY_RELATIONSHIPS,
        default: "Autre",
      },

      joinedAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      _id: false,
    }
  );

// ======================================================
// SCHÉMA FAMILLE
// ======================================================

const familySchema =
  new mongoose.Schema(
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
      // IDENTITÉ DU FOYER
      // ==================================================

      name: {
        type: String,
        required: true,
        trim: true,
      },

      // ==================================================
      // RESPONSABLE DU FOYER
      // ==================================================

      headOfHousehold: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        default: null,
      },

      // ==================================================
      // COORDONNÉES DU FOYER
      // ==================================================

      phone: {
        type: String,
        trim: true,
        default: "",
      },

      address: {
        type: String,
        trim: true,
        default: "",
      },

      // ==================================================
      // MEMBRES DU FOYER
      // ==================================================

      members: {
        type: [familyMemberSchema],
        default: [],
      },

      // ==================================================
      // NOTES
      // ==================================================

      notes: {
        type: String,
        trim: true,
        default: "",
      },

      // ==================================================
      // STATUT
      // ==================================================

      isActive: {
        type: Boolean,
        default: true,
        index: true,
      },
    },
    {
      timestamps: true,
    }
  );

// ======================================================
// VALIDATION : PAS DE DOUBLON DANS UNE FAMILLE
// ======================================================

familySchema.pre(
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
        "Une personne ne peut apparaître qu'une seule fois dans une famille."
      );
    }
  }
);

// ======================================================
// INDEXES
// ======================================================

familySchema.index({
  church: 1,
  name: 1,
});

familySchema.index({
  church: 1,
  isActive: 1,
});

familySchema.index({
  church: 1,
  "members.member": 1,
});

// ======================================================
// EXPORT
// ======================================================

const Family =
  mongoose.model(
    "Family",
    familySchema
  );

module.exports =
  Family;

module.exports.FAMILY_RELATIONSHIPS =
  FAMILY_RELATIONSHIPS;