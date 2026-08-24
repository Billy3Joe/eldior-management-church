const requireChurch = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Utilisateur non authentifié",
    });
  }

  const churchId =
    req.churchId ||
    req.user.church?._id ||
    req.user.church ||
    null;

  if (!churchId) {
    return res.status(403).json({
      success: false,
      message:
        "Aucune église n'est associée à cet utilisateur",
    });
  }

  req.churchId = churchId.toString();

  next();
};

module.exports = requireChurch;