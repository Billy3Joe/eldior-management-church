const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");

const connectDB = require(
  "../config/db"
);

const ActivityLog = require(
  "../models/ActivityLog"
);

const Church = require(
  "../models/Church"
);

const CHURCH_ID =
  "6a8c9d8acdde76f77bc39b46";

const migrateActivityLogsToChurch =
  async () => {
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
        await ActivityLog.updateMany(
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
        "✅ Activity Logs migrés :",
        result.modifiedCount
      );
    } catch (error) {
      console.error(
        "❌ Erreur migration Activity Logs :",
        error.message
      );
    } finally {
      await mongoose.connection.close();
      process.exit();
    }
  };

migrateActivityLogsToChurch();