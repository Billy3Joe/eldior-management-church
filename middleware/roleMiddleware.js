const authorizeRoles = (
  ...roles
) => {
  return (
    req,
    res,
    next
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Utilisateur non authentifié",
      });
    }

    // ==================================================
    // LE SUPERADMIN PLATEFORME A TOUS LES DROITS
    // ==================================================

    if (
      req.user.platformRole ===
      "superadmin"
    ) {
      return next();
    }

    const currentRole =
      req.churchRole ||
      req.user.role;

    if (
      !roles.includes(
        currentRole
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

module.exports =
  authorizeRoles;