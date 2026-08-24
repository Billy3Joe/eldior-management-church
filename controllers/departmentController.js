const mongoose = require("mongoose");

const Department = require("../models/Department");
const Member = require("../models/Member");

const createActivityLog = require(
  "../utils/createActivityLog"
);

// ======================================================
// CRÉER
// ======================================================

const createDepartment = async (req, res) => {
  try {
    const {
      name,
      description,
      leader,
      status,
    } = req.body;

    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Le nom du département est obligatoire",
      });
    }

    const existingDepartment =
      await Department.findOne({
        church: req.churchId,
        name: {
          $regex: `^${name.trim()}$`,
          $options: "i",
        },
      });

    if (existingDepartment) {
      return res.status(400).json({
        success: false,
        message:
          "Ce département existe déjà dans cette église",
      });
    }

    const department =
      await Department.create({
        church: req.churchId,
        name: name.trim(),
        description:
          description?.trim() || "",
        leader:
          leader?.trim() || "",
        status:
          status || "Actif",
      });

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "Department",
      entityId: department._id,
      description:
        `Création du département ${department.name}`,
    });

    return res.status(201).json({
      success: true,
      message:
        "Département créé avec succès",
      data: department,
    });
  } catch (error) {
    console.error(
      "Erreur createDepartment :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// LISTE
// ======================================================

const getDepartments = async (req, res) => {
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
      parseInt(req.query.limit, 10) || 10;

    const skip =
      (page - 1) * limit;

    const {
      search,
      status,
    } = req.query;

    const filter = {
      church: req.churchId,
    };

    if (status) {
      filter.status = status;
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
          description: {
            $regex: search,
            $options: "i",
          },
        },
        {
          leader: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const total =
      await Department.countDocuments(filter);

    const departments =
      await Department.find(filter)
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
        Math.ceil(total / limit),
      count:
        departments.length,
      data:
        departments,
    });
  } catch (error) {
    console.error(
      "Erreur getDepartments :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// DÉTAIL
// ======================================================

const getDepartmentById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID département invalide",
      });
    }

    const department =
      await Department.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!department) {
      return res.status(404).json({
        success: false,
        message:
          "Département introuvable",
      });
    }

    const membersCount =
      await Member.countDocuments({
        church: req.churchId,
        department: department._id,
      });

    return res.status(200).json({
      success: true,
      data: {
        ...department.toObject(),
        membersCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// MODIFIER
// ======================================================

const updateDepartment = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID département invalide",
      });
    }

    const department =
      await Department.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!department) {
      return res.status(404).json({
        success: false,
        message:
          "Département introuvable",
      });
    }

    const {
      name,
      description,
      leader,
      status,
    } = req.body;

    if (
      typeof name !== "undefined"
    ) {
      if (!name.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Le nom du département ne peut pas être vide",
        });
      }

      const duplicate =
        await Department.findOne({
          _id: {
            $ne: department._id,
          },
          church: req.churchId,
          name: {
            $regex: `^${name.trim()}$`,
            $options: "i",
          },
        });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message:
            "Un autre département porte déjà ce nom",
        });
      }

      department.name =
        name.trim();
    }

    if (
      typeof description !==
      "undefined"
    ) {
      department.description =
        description.trim();
    }

    if (
      typeof leader !==
      "undefined"
    ) {
      department.leader =
        leader.trim();
    }

    if (
      typeof status !==
      "undefined"
    ) {
      department.status =
        status;
    }

    await department.save();

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Department",
      entityId: department._id,
      description:
        `Modification du département ${department.name}`,
    });

    return res.status(200).json({
      success: true,
      message:
        "Département mis à jour avec succès",
      data: department,
    });
  } catch (error) {
    console.error(
      "Erreur updateDepartment :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// SUPPRIMER
// ======================================================

const deleteDepartment = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID département invalide",
      });
    }

    const department =
      await Department.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!department) {
      return res.status(404).json({
        success: false,
        message:
          "Département introuvable",
      });
    }

    // Retirer le département des membres
    // avant suppression.
    await Member.updateMany(
      {
        church: req.churchId,
        department: department._id,
      },
      {
        $set: {
          department: null,
        },
      }
    );

    const departmentName =
      department.name;

    await department.deleteOne();

    await createActivityLog({
      req,
      action: "DELETE",
      entity: "Department",
      entityId: id,
      description:
        `Suppression du département ${departmentName}`,
    });

    return res.status(200).json({
      success: true,
      message:
        "Département supprimé avec succès",
    });
  } catch (error) {
    console.error(
      "Erreur deleteDepartment :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
};