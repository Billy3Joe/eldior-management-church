const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const User = require("../models/User");

// ======================================================
// GÉNÉRER TOKEN
// ======================================================

const generateToken = (user) => {
  let churchId = null;

  if (user.church) {
    if (user.church._id) {
      churchId = user.church._id.toString();
    } else {
      churchId = user.church.toString();
    }
  }

  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      churchId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
};

// ======================================================
// REGISTER
// ======================================================

const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      church,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Nom, email et mot de passe sont requis",
      });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "Cet utilisateur existe déjà",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || "manager",
      church: church || null,
    });

    const populatedUser =
      await User.findById(user._id)
        .select("-password")
        .populate(
          "church",
          "name slug plan status isActive"
        );

    const token =
      generateToken(populatedUser);

    return res.status(201).json({
      success: true,
      message:
        "Utilisateur créé avec succès",
      token,
      data: populatedUser,
    });
  } catch (error) {
    console.error("Erreur register :", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// LOGIN
// ======================================================

const login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email et mot de passe requis",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    }).populate(
      "church",
      "name slug plan status isActive"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Email ou mot de passe incorrect",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message:
          "Ce compte utilisateur est désactivé",
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message:
          "Email ou mot de passe incorrect",
      });
    }

    if (
      user.church &&
      user.church.isActive === false
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Cette église est désactivée",
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
          "L'accès à cette organisation est suspendu",
      });
    }

    user.lastLoginAt = new Date();

    await user.save();

    const token =
      generateToken(user);

    const churchId =
      user.church?._id
        ? user.church._id.toString()
        : null;

    return res.status(200).json({
      success: true,
      message:
        "Connexion réussie",
      token,

      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,

        church:
          user.church || null,

        churchId,
      },
    });
  } catch (error) {
    console.error("Erreur login :", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// GET PROFILE
// ======================================================

const getProfile = async (
  req,
  res
) => {
  try {
    const user =
      await User.findById(req.user._id)
        .select("-password")
        .populate(
          "church",
          "name slug email phone city country logo plan status isActive"
        );

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Utilisateur introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// UPDATE PROFILE
// ======================================================

const updateProfile = async (
  req,
  res
) => {
  try {
    const user =
      await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Utilisateur introuvable",
      });
    }

    if (
      typeof req.body.name !==
      "undefined"
    ) {
      user.name =
        req.body.name.trim();
    }

    if (
      typeof req.body.email !==
      "undefined"
    ) {
      const email =
        req.body.email
          .trim()
          .toLowerCase();

      const existingEmail =
        await User.findOne({
          email,
          _id: {
            $ne: user._id,
          },
        });

      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message:
            "Cette adresse email est déjà utilisée",
        });
      }

      user.email = email;
    }

    await user.save();

    const updatedUser =
      await User.findById(user._id)
        .select("-password")
        .populate(
          "church",
          "name slug plan status isActive"
        );

    return res.status(200).json({
      success: true,
      message:
        "Profil mis à jour avec succès",
      data: updatedUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// CHANGE PASSWORD
// ======================================================

const changePassword = async (
  req,
  res
) => {
  try {
    const {
      currentPassword,
      newPassword,
    } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Mot de passe actuel et nouveau mot de passe requis",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Le nouveau mot de passe doit contenir au moins 6 caractères",
      });
    }

    const user =
      await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Utilisateur introuvable",
      });
    }

    const matches =
      await bcrypt.compare(
        currentPassword,
        user.password
      );

    if (!matches) {
      return res.status(400).json({
        success: false,
        message:
          "Mot de passe actuel incorrect",
      });
    }

    user.password = newPassword;

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Mot de passe modifié avec succès",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
};