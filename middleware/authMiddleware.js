const jwt = require("jsonwebtoken");

const User = require("../models/User");

// ======================================================
// AUTHENTIFICATION
// ======================================================

const protect = async (req, res, next) => {
  try {
    let token = null;

    // ==================================================
    // RÉCUPÉRATION DU TOKEN
    // ==================================================

    const authHeader =
      req.headers.authorization;

    if (
      authHeader &&
      authHeader.startsWith("Bearer ")
    ) {
      token =
        authHeader.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message:
          "Accès refusé. Token d'authentification manquant.",
      });
    }

    // ==================================================
    // VÉRIFICATION JWT
    // ==================================================

    let decoded;

    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );
    } catch (error) {
      return res.status(401).json({
        success: false,
        message:
          "Token invalide ou expiré",
      });
    }

    // ==================================================
    // UTILISATEUR
    // ==================================================

    const user = await User.findById(
      decoded.id
    )
      .select("-password")
      .populate(
        "church",
        "name slug plan status isActive"
      )
      .populate(
        "churchMemberships.church",
        "name slug plan status isActive"
      );

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Utilisateur introuvable",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message:
          "Compte utilisateur désactivé",
      });
    }

    // ==================================================
    // INFORMATIONS UTILISATEUR
    // ==================================================

    req.user = user;

    // Rôle plateforme
    req.platformRole =
      user.platformRole || "user";

    // Rôle dans l'église
    req.churchRole =
      user.role || "member";

    // ==================================================
    // ÉGLISE ACTIVE
    // ==================================================

    if (user.church) {
      if (user.church._id) {
        req.churchId =
          user.church._id.toString();
      } else {
        req.churchId =
          user.church.toString();
      }
    } else {
      req.churchId = null;
    }

    // ==================================================
    // INFORMATIONS JWT
    // ==================================================

    req.auth = {
      userId:
        user._id.toString(),

      platformRole:
        user.platformRole || "user",

      role:
        user.role || "member",

      churchId:
        req.churchId,
    };

    next();
  } catch (error) {
    console.error(
      "AUTH MIDDLEWARE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Erreur lors de l'authentification",
      error:
        error.message,
    });
  }
};

// ======================================================
// EXPORT COMPATIBLE AVEC LES ANCIENS FICHIERS
// ======================================================

// Ancienne syntaxe :
// const protect = require("../middleware/authMiddleware");
module.exports = protect;

// Nouvelle syntaxe :
// const { protect } = require("../middleware/authMiddleware");
module.exports.protect = protect;