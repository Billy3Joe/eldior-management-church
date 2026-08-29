const authorizePlatformRoles = (
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
  
      const platformRole =
        req.user.platformRole ||
        "user";
  
      if (
        !roles.includes(
          platformRole
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Accès réservé à l'administration de la plateforme",
        });
      }
  
      next();
    };
  };
  
  module.exports =
    authorizePlatformRoles;