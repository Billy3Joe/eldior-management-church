const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");

const connectDB = require("../config/db");

const Church = require("../models/Church");
const User = require("../models/User");
const ChurchSettings = require("../models/ChurchSettings");

const setupFirstChurch = async () => {
  try {
    await connectDB();

    console.log("🏛️ Création de la première église...");

    // ==================================================
    // 1. RECHERCHER / CRÉER L'ÉGLISE
    // ==================================================

    let church = await Church.findOne({
      slug: "eldior-management-church",
    });

    if (!church) {
      church = await Church.create({
        name: "ElDior Management Church",
        slug: "eldior-management-church",

        email: "",
        phone: "",
        address: "",
        city: "",
        country: "France",

        status: "active",
        plan: "premium",

        maxMembers: 1000,

        isActive: true,
      });

      console.log(
        "✅ Église créée :",
        church.name
      );
    } else {
      console.log(
        "ℹ️ Église déjà existante :",
        church.name
      );
    }

    // ==================================================
    // 2. TROUVER BILLY ADMIN
    // ==================================================

    const admin = await User.findOne({
      email: "admin@eldior.com",
    });

    if (!admin) {
      throw new Error(
        "Utilisateur admin@eldior.com introuvable"
      );
    }

    // ==================================================
    // 3. RATTACHER ADMIN À L'ÉGLISE
    // ==================================================

    admin.church = church._id;

    await admin.save();

    console.log(
      "✅ Billy Admin rattaché à :",
      church.name
    );

    // ==================================================
    // 4. CRÉATEUR DE L'ÉGLISE
    // ==================================================

    church.createdBy = admin._id;

    await church.save();

    // ==================================================
    // 5. RATTACHER LES SETTINGS EXISTANTS
    // ==================================================

    let settings =
      await ChurchSettings.findOne({
        church: church._id,
      });

    if (!settings) {
      // Chercher l'ancien Settings sans église
      settings =
        await ChurchSettings.findOne({
          church: null,
        });

      if (settings) {
        settings.church =
          church._id;

        if (!settings.churchName) {
          settings.churchName =
            church.name;
        }

        await settings.save();

        console.log(
          "✅ Paramètres existants rattachés à l'église"
        );
      } else {
        settings =
          await ChurchSettings.create({
            church: church._id,
            churchName: church.name,

            reminderEnabled: true,
            reminderDays: [2, 1],
            reminderHour: 9,
            timezone: "Europe/Paris",
          });

        console.log(
          "✅ Paramètres de l'église créés"
        );
      }
    } else {
      console.log(
        "ℹ️ Paramètres déjà rattachés à cette église"
      );
    }

    // ==================================================
    // RÉSULTAT
    // ==================================================

    console.log("");
    console.log("======================================");
    console.log("✅ CONFIGURATION TERMINÉE");
    console.log("======================================");

    console.log(
      "Église :",
      church.name
    );

    console.log(
      "Church ID :",
      church._id.toString()
    );

    console.log(
      "Admin :",
      admin.email
    );

    console.log(
      "User ID :",
      admin._id.toString()
    );

    console.log(
      "Plan :",
      church.plan
    );

    console.log(
      "Statut :",
      church.status
    );

    console.log("======================================");
  } catch (error) {
    console.error(
      "❌ Erreur setupFirstChurch :",
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

setupFirstChurch();