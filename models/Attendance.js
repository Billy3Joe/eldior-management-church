const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    status: {
      type: String,
      enum: ["Présent", "Absent", "Excusé"],
      default: "Présent",
    },
  },
  { timestamps: true }
);

// Un membre ne peut avoir qu'une seule présence par événement
attendanceSchema.index({ memberId: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);