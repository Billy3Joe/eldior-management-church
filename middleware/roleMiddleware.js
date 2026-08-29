const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Utilisateur non authentifié",
      });
    }

    if (
      !roles.includes(
        req.user.role
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Vous n'avez pas l'autorisation d'effectuer cette action",
      });
    }

    next();
  };
};

module.exports = authorizeRoles;