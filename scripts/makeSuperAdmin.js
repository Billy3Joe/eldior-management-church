// ======================================================
// VARIABLES D'ENVIRONNEMENT
// ======================================================

require("dotenv").config();

// ======================================================
// IMPORTS
// ======================================================

const mongoose = require("mongoose");

const User = require("../models/User");

const Church = require("../models/Church");

// ======================================================
// CONFIGURATION
// ======================================================

const SUPER_ADMIN_EMAIL =
  "admin@eldior.com";

// ======================================================
// SCRIPT
// ======================================================

const makeSuperAdmin =
  async () => {
    try {
      // ==================================================
      // CONNEXION MONGODB
      // ==================================================

      if (!process.env.MONGO_URI) {
        throw new Error(
          "MONGO_URI est absent du fichier .env"
        );
      }

      await mongoose.connect(
        process.env.MONGO_URI
      );

      console.log(
        "✅ MongoDB connecté"
      );

      // ==================================================
      // RECHERCHE DU COMPTE
      // ==================================================

      const user =
        await User.findOne({
          email:
            SUPER_ADMIN_EMAIL.toLowerCase(),
        });

      if (!user) {
        console.log(
          `❌ Aucun utilisateur trouvé avec l'adresse ${SUPER_ADMIN_EMAIL}`
        );

        await mongoose.disconnect();

        process.exit(1);
      }

      console.log(
        "👤 Utilisateur trouvé :",
        user.name
      );

      console.log(
        "📧 Email :",
        user.email
      );

      // ==================================================
      // PASSAGE EN SUPER ADMIN
      // ==================================================

      user.platformRole =
        "superadmin";

      // ==================================================
      // CONSERVATION DU RÔLE DANS L'ÉGLISE
      // ==================================================

      if (!user.role) {
        user.role = "admin";
      }

      // ==================================================
      // AJOUT DE L'ÉGLISE DANS LES MEMBERSHIPS
      // SI NÉCESSAIRE
      // ==================================================

      if (user.church) {
        const churchId =
          user.church.toString();

        const alreadyExists =
          user.churchMemberships.some(
            (membership) =>
              membership.church.toString() ===
              churchId
          );

        if (!alreadyExists) {
          user.churchMemberships.push({
            church:
              user.church,

            role:
              user.role ||
              "admin",

            isActive:
              true,

            joinedAt:
              new Date(),
          });

          console.log(
            "✅ Église ajoutée aux appartenances du compte"
          );
        }
      }

      // ==================================================
      // SAUVEGARDE
      // ==================================================

      await user.save();

      // ==================================================
      // VÉRIFICATION
      // ==================================================

      const updatedUser =
        await User.findById(
          user._id
        )
          .select(
            "-password"
          )
          .populate(
            "church",
            "name slug email plan status"
          )
          .populate(
            "churchMemberships.church",
            "name slug email plan status"
          );

      console.log("");
      console.log(
        "=============================================="
      );

      console.log(
        "🛡️ COMPTE SUPER ADMIN CONFIGURÉ"
      );

      console.log(
        "=============================================="
      );

      console.log(
        "Nom :",
        updatedUser.name
      );

      console.log(
        "Email :",
        updatedUser.email
      );

      console.log(
        "Platform Role :",
        updatedUser.platformRole
      );

      console.log(
        "Rôle église :",
        updatedUser.role
      );

      console.log(
        "Église :",
        updatedUser.church
          ?.name ||
          "Aucune"
      );

      console.log(
        "Compte actif :",
        updatedUser.isActive
      );

      console.log(
        "=============================================="
      );

      console.log("");
      console.log(
        "✅ Migration terminée avec succès"
      );

      // ==================================================
      // DÉCONNEXION
      // ==================================================

      await mongoose.disconnect();

      process.exit(0);
    } catch (error) {
      console.error(
        "❌ Erreur migration Super Admin :",
        error
      );

      try {
        await mongoose.disconnect();
      } catch (disconnectError) {
        // Rien à faire
      }

      process.exit(1);
    }
  };

// ======================================================
// LANCEMENT
// ======================================================

makeSuperAdmin();