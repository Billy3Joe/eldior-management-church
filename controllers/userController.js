const mongoose = require("mongoose");

const User = require("../models/User");
const createActivityLog = require(
  "../utils/createActivityLog"
);

// ======================================================
// LISTE DES UTILISATEURS DE L'ÉGLISE
// ======================================================

const getUsers = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const page =
      parseInt(req.query.page, 10) || 1;

    const limit =
      parseInt(req.query.limit, 10) || 20;

    const skip =
      (page - 1) * limit;

    const {
      search,
      role,
      isActive,
    } = req.query;

    const filter = {
      church: req.churchId,
    };

    if (role) {
      filter.role = role;
    }

    if (
      typeof isActive !==
      "undefined"
    ) {
      filter.isActive =
        isActive === "true";
    }

    if (search) {
      filter.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },
        {
          email: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const total =
      await User.countDocuments(filter);

    const users =
      await User.find(filter)
        .select("-password")
        .populate(
          "church",
          "name slug plan status"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages:
        Math.max(
          1,
          Math.ceil(total / limit)
        ),
      count:
        users.length,
      data:
        users,
    });
  } catch (error) {
    console.error(
      "Erreur getUsers :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// ======================================================
// DÉTAIL UTILISATEUR
// ======================================================

const getUserById = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID utilisateur invalide",
      });
    }

    const user =
      await User.findOne({
        _id: id,
        church: req.churchId,
      })
        .select("-password")
        .populate(
          "church",
          "name slug plan status"
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
      message:
        error.message,
    });
  }
};

// ======================================================
// CRÉER UN UTILISATEUR
// ======================================================

const createUser = async (
  req,
  res
) => {
  try {
    const {
      name,
      email,
      password,
      role,
      isActive,
    } = req.body;

    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    if (
      !name ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Nom, email et mot de passe sont requis",
      });
    }

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    const existingUser =
      await User.findOne({
        email: cleanEmail,
      });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "Cette adresse email est déjà utilisée",
      });
    }

    const allowedRoles = [
      "admin",
      "manager",
    ];

    const selectedRole =
      allowedRoles.includes(role)
        ? role
        : "manager";

    const user =
      await User.create({
        name:
          name.trim(),

        email:
          cleanEmail,

        password,

        role:
          selectedRole,

        church:
          req.churchId,

        isActive:
          typeof isActive ===
          "boolean"
            ? isActive
            : true,
      });

    const safeUser =
      await User.findById(
        user._id
      )
        .select("-password")
        .populate(
          "church",
          "name slug plan status"
        );

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "User",
      entityId: user._id,
      description:
        `Création de l'utilisateur ${user.name} (${user.role})`,
    });

    return res.status(201).json({
      success: true,
      message:
        "Utilisateur créé avec succès",
      data:
        safeUser,
    });
  } catch (error) {
    console.error(
      "Erreur createUser :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// ======================================================
// MODIFIER UN UTILISATEUR
// ======================================================

const updateUser = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID utilisateur invalide",
      });
    }

    const user =
      await User.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Utilisateur introuvable",
      });
    }

    const {
      name,
      email,
      role,
      isActive,
      password,
    } = req.body;

    if (
      typeof name !==
      "undefined"
    ) {
      user.name =
        name.trim();
    }

    if (
      typeof email !==
      "undefined"
    ) {
      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      const duplicate =
        await User.findOne({
          email:
            cleanEmail,
          _id: {
            $ne: user._id,
          },
        });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message:
            "Cette adresse email est déjà utilisée",
        });
      }

      user.email =
        cleanEmail;
    }

    if (
      typeof role !==
      "undefined"
    ) {
      if (
        ![
          "admin",
          "manager",
        ].includes(role)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Rôle utilisateur invalide",
        });
      }

      user.role = role;
    }

    if (
      typeof isActive !==
      "undefined"
    ) {
      user.isActive =
        Boolean(isActive);
    }

    if (
      typeof password !==
        "undefined" &&
      password
    ) {
      if (
        password.length < 6
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Le mot de passe doit contenir au moins 6 caractères",
        });
      }

      user.password =
        password;
    }

    await user.save();

    const updatedUser =
      await User.findById(
        user._id
      )
        .select("-password")
        .populate(
          "church",
          "name slug plan status"
        );

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "User",
      entityId:
        user._id,
      description:
        `Modification de l'utilisateur ${user.name}`,
    });

    return res.status(200).json({
      success: true,
      message:
        "Utilisateur mis à jour avec succès",
      data:
        updatedUser,
    });
  } catch (error) {
    console.error(
      "Erreur updateUser :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// ======================================================
// ACTIVER / DÉSACTIVER
// ======================================================

const toggleUserStatus = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    const user =
      await User.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Utilisateur introuvable",
      });
    }

    if (
      user._id.toString() ===
      req.user._id.toString()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Vous ne pouvez pas désactiver votre propre compte ici",
      });
    }

    user.isActive =
      !user.isActive;

    await user.save();

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "User",
      entityId:
        user._id,
      description:
        `${user.isActive
          ? "Activation"
          : "Désactivation"
        } de l'utilisateur ${user.name}`,
    });

    return res.status(200).json({
      success: true,
      message:
        user.isActive
          ? "Utilisateur activé"
          : "Utilisateur désactivé",
      data: {
        _id:
          user._id,
        isActive:
          user.isActive,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// ======================================================
// SUPPRIMER
// ======================================================

const deleteUser = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID utilisateur invalide",
      });
    }

    const user =
      await User.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Utilisateur introuvable",
      });
    }

    if (
      user._id.toString() ===
      req.user._id.toString()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Vous ne pouvez pas supprimer votre propre compte",
      });
    }

    const userName =
      user.name;

    await user.deleteOne();

    await createActivityLog({
      req,
      action: "DELETE",
      entity: "User",
      entityId: id,
      description:
        `Suppression de l'utilisateur ${userName}`,
    });

    return res.status(200).json({
      success: true,
      message:
        "Utilisateur supprimé avec succès",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  deleteUser,
};