const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");

const connectDB = require("../config/db");

const Member = require("../models/Member");
const Church = require("../models/Church");

const CHURCH_ID = "6a8c9d8acdde76f77bc39b46";

const migrateMembersToChurch = async () => {
  try {
    await connectDB();

    console.log("🔄 Migration des membres vers l'église...");

    // Vérifier que l'église existe
    const church = await Church.findById(CHURCH_ID);

    if (!church) {
      throw new Error(
        `Église introuvable avec l'ID ${CHURCH_ID}`
      );
    }

    console.log(
      "🏛️ Église cible :",
      church.name
    );

    // Membres qui n'ont pas encore d'église
    const membersWithoutChurch =
      await Member.find({
        $or: [
          { church: null },
          { church: { $exists: false } },
        ],
      });

    console.log(
      `👥 ${membersWithoutChurch.length} membre(s) à migrer`
    );

    if (membersWithoutChurch.length === 0) {
      console.log(
        "ℹ️ Aucun membre à migrer"
      );

      return;
    }

    const result =
      await Member.updateMany(
        {
          $or: [
            { church: null },
            { church: { $exists: false } },
          ],
        },
        {
          $set: {
            church: church._id,
          },
        }
      );

    console.log(
      "✅ Migration terminée"
    );

    console.log(
      "Membres correspondants :",
      result.matchedCount
    );

    console.log(
      "Membres modifiés :",
      result.modifiedCount
    );

    // Vérification
    const totalInChurch =
      await Member.countDocuments({
        church: church._id,
      });

    console.log(
      `👥 Total membres dans ${church.name} :`,
      totalInChurch
    );
  } catch (error) {
    console.error(
      "❌ Erreur migrateMembersToChurch :",
      error
    );
  } finally {
    await mongoose.connection.close();

    console.log(
      "🔌 Connexion MongoDB fermée"
    );

    process.exit();
  }
};

migrateMembersToChurch();