const requireChurch = (
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

  // ====================================================
  // ÉGLISE FOURNIE PAR UN SUPERADMIN
  //
  // Cela nous servira plus tard pour le dashboard
  // plateforme permettant de rentrer dans une église.
  // ====================================================

  const requestedChurchId =
    req.headers[
      "x-church-id"
    ] ||
    req.query.churchId ||
    null;

  // ====================================================
  // SUPER ADMIN
  // ====================================================

  if (
    req.user.platformRole ===
      "superadmin" &&
    requestedChurchId
  ) {
    req.churchId =
      requestedChurchId.toString();

    return next();
  }

  // ====================================================
  // UTILISATEUR NORMAL
  // ====================================================

  const churchId =
    req.churchId ||
    req.user.church?._id ||
    req.user.church ||
    null;

  if (!churchId) {
    return res.status(403).json({
      success: false,
      message:
        "Aucune église active n'est sélectionnée",
    });
  }

  req.churchId =
    churchId.toString();

  // ====================================================
  // SUPERADMIN AVEC ÉGLISE PAR DÉFAUT
  // ====================================================

  if (
    req.user.platformRole ===
    "superadmin"
  ) {
    return next();
  }

  // ====================================================
  // VÉRIFIER L'APPARTENANCE
  // ====================================================

  const memberships =
    req.user.churchMemberships ||
    [];

  // Compatibilité avec les anciens comptes :
  // s'ils ont déjà un church mais pas encore de memberships,
  // ils peuvent continuer à utiliser l'application.

  if (
    memberships.length === 0
  ) {
    return next();
  }

  const membership =
    memberships.find(
      (item) => {
        const membershipChurchId =
          item.church?._id
            ? item.church._id.toString()
            : item.church?.toString();

        return (
          membershipChurchId ===
            req.churchId &&
          item.isActive !==
            false
        );
      }
    );

  if (!membership) {
    return res.status(403).json({
      success: false,
      message:
        "Vous n'appartenez pas à cette église",
    });
  }

  req.churchRole =
    membership.role ||
    req.user.role ||
    "member";

  next();
};

module.exports =
  requireChurch;