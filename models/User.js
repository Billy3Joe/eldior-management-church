const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const churchMembershipSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      required: true,
    },

    role: {
      type: String,
      enum: ["admin", "manager", "member"],
      default: "member",
    },

    isActive: {
      type: Boolean,
      default: true,
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

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    // ==================================================
    // RÔLE GLOBAL SUR LA PLATEFORME
    // ==================================================

    platformRole: {
      type: String,
      enum: ["superadmin", "user"],
      default: "user",
      index: true,
    },

    // ==================================================
    // RÔLE DANS L'ÉGLISE ACTIVE
    //
    // Conservé pour compatibilité avec le système actuel
    // ==================================================

    role: {
      type: String,
      enum: ["admin", "manager", "member"],
      default: "member",
    },

    // ==================================================
    // ÉGLISE ACTIVE / PAR DÉFAUT
    // ==================================================

    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      default: null,
      index: true,
    },

    // ==================================================
    // TOUTES LES ÉGLISES AUXQUELLES LE COMPTE APPARTIENT
    // ==================================================

    churchMemberships: {
      type: [churchMembershipSchema],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ======================================================
// INDEX
// ======================================================

userSchema.index({
  "churchMemberships.church": 1,
});

// ======================================================
// HASH PASSWORD
// ======================================================

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt =
    await bcrypt.genSalt(10);

  this.password =
    await bcrypt.hash(
      this.password,
      salt
    );
});

// ======================================================
// MATCH PASSWORD
// ======================================================

userSchema.methods.matchPassword =
  async function (
    enteredPassword
  ) {
    return bcrypt.compare(
      enteredPassword,
      this.password
    );
  };

// ======================================================
// VÉRIFIER SI L'UTILISATEUR APPARTIENT À UNE ÉGLISE
// ======================================================

userSchema.methods.hasChurchMembership =
  function (churchId) {
    if (!churchId) {
      return false;
    }

    return this.churchMemberships.some(
      (membership) =>
        membership.isActive &&
        membership.church.toString() ===
          churchId.toString()
    );
  };

// ======================================================
// RÉCUPÉRER LE RÔLE DANS UNE ÉGLISE
// ======================================================

userSchema.methods.getChurchRole =
  function (churchId) {
    if (!churchId) {
      return null;
    }

    const membership =
      this.churchMemberships.find(
        (item) =>
          item.isActive &&
          item.church.toString() ===
            churchId.toString()
      );

    return membership?.role || null;
  };

module.exports =
  mongoose.model(
    "User",
    userSchema
  );