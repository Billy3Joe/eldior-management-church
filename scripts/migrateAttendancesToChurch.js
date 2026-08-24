const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Attendance = require("../models/Attendance");
const Church = require("../models/Church");

const CHURCH_ID =
  "6a8c9d8acdde76f77bc39b46";

const migrateAttendancesToChurch = async () => {
  try {
    await connectDB();

    const church =
      await Church.findById(
        CHURCH_ID
      );

    if (!church) {
      throw new Error(
        "Église introuvable"
      );
    }

    const result =
      await Attendance.updateMany(
        {
          $or: [
            {
              church: null,
            },
            {
              church: {
                $exists: false,
              },
            },
          ],
        },
        {
          $set: {
            church:
              church._id,
          },
        }
      );

    console.log(
      "✅ Présences migrées :",
      result.modifiedCount
    );
  } catch (error) {
    console.error(
      "❌ Erreur migration présences :",
      error.message
    );
  } finally {
    await mongoose.connection.close();
    process.exit();
  }
};

migrateAttendancesToChurch();