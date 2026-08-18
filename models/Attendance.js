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
      required: true,
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ memberId: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);