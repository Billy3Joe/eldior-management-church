const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: String,
    date: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);