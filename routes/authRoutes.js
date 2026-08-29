const express = require("express");

const router = express.Router();

const {
  register,
  registerChurch,
  login,
  getProfile,
  updateProfile,
  changePassword,
} = require("../controllers/authController");

const authMiddleware =
  require("../middleware/authMiddleware");

// ======================================================
// COMPATIBILITÉ EXPORT AUTH MIDDLEWARE
// ======================================================

const protect =
  authMiddleware.protect ||
  authMiddleware;

// ======================================================
// ROUTES PUBLIQUES
// ======================================================

// Création d'un compte utilisateur
router.post(
  "/register",
  register
);

// ======================================================
// CRÉATION D'UNE NOUVELLE ÉGLISE
// ======================================================

router.post(
  "/register-church",
  registerChurch
);

// ======================================================
// CONNEXION
// ======================================================

router.post(
  "/login",
  login
);

// ======================================================
// ROUTES PROTÉGÉES
// ======================================================

// Profil utilisateur connecté
router.get(
  "/profile",
  protect,
  getProfile
);

// Modifier le profil
router.put(
  "/profile",
  protect,
  updateProfile
);

// Modifier le mot de passe
router.put(
  "/change-password",
  protect,
  changePassword
);

module.exports = router;