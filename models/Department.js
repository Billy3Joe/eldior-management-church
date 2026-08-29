const mongoose =
  require("mongoose");

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
      },

      leader: {
        type: String,

        default: "",

        trim: true,
      },

      description: {
        type: String,

        default: "",

        trim: true,
      },

      status: {
        type: String,

        enum: [
          "active",
          "inactive",
        ],

        default:
          "active",

        index: true,
      },
    },

    {
      timestamps: true,
    }
  );

// ======================================================
// INDEX
// Empêche deux départements
// portant exactement le même nom
// dans une même église
// ======================================================

departmentSchema.index(
  {
    church: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

// ======================================================
// EXPORT
// ======================================================

module.exports =
  mongoose.model(
    "Department",
    departmentSchema
  );