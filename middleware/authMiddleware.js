const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (
  req,
  res,
  next
) => {
  try {
    const authHeader =
      req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message:
          "Aucun token fourni",
      });
    }

    if (
      !authHeader.startsWith(
        "Bearer "
      )
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Format Authorization invalide",
      });
    }

    const token =
      authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message:
          "Token manquant",
      });
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    console.log(
      "TOKEN DECODED :",
      decoded
    );

    const user =
      await User.findById(decoded.id)
        .select("-password")
        .populate(
          "church",
          "name slug plan status isActive"
        );

    console.log(
      "USER TROUVÉ :",
      user
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Utilisateur non autorisé",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message:
          "Compte utilisateur désactivé",
      });
    }

    if (
      user.church &&
      user.church.isActive === false
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Organisation désactivée",
      });
    }

    if (
      user.church &&
      ["suspended", "cancelled"].includes(
        user.church.status
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Accès à l'organisation suspendu",
      });
    }

    req.user = user;

    // ==================================================
    // CHURCH ID PROPRE
    // ==================================================

    if (user.church?._id) {
      req.churchId =
        user.church._id.toString();
    } else if (decoded.churchId) {
      req.churchId =
        decoded.churchId;
    } else {
      req.churchId =
        null;
    }

    console.log(
      "CHURCH ID :",
      req.churchId
    );

    next();
  } catch (error) {
    console.error(
      "Erreur authMiddleware :",
      error.message
    );

    return res.status(401).json({
      success: false,
      message:
        "Token invalide ou expiré",
    });
  }
};

module.exports = protect;