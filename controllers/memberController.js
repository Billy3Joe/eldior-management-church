const mongoose = require("mongoose");

const Member = require("../models/Member");
const Department = require("../models/Department");

const createActivityLog = require(
  "../utils/createActivityLog"
);

// ======================================================
// CRÉER UN MEMBRE
// ======================================================

const createMember = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      gender,
      phone,
      email,
      address,
      department,
      status,
    } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message:
          "Le prénom et le nom sont obligatoires",
      });
    }

    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    let departmentExists = null;

    if (department) {
      if (
        !mongoose.Types.ObjectId.isValid(
          department
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "ID département invalide",
        });
      }

      departmentExists =
        await Department.findOne({
          _id: department,
          church: req.churchId,
        });

      if (!departmentExists) {
        return res.status(404).json({
          success: false,
          message:
            "Département introuvable pour cette église",
        });
      }
    }

    const member = await Member.create({
      church: req.churchId,

      firstName:
        firstName.trim(),

      lastName:
        lastName.trim(),

      gender:
        gender || "",

      phone:
        phone?.trim() || "",

      email:
        email?.trim().toLowerCase() || "",

      address:
        address?.trim() || "",

      department:
        department || null,

      status:
        status || "Actif",
    });

    const populatedMember =
      await Member.findOne({
        _id: member._id,
        church: req.churchId,
      })
        .populate(
          "department",
          "name description leader status"
        )
        .populate(
          "church",
          "name slug"
        );

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "Member",
      entityId: member._id,

      description: `Création du membre ${firstName} ${lastName}`,
    });

    return res.status(201).json({
      success: true,
      message:
        "Membre créé avec succès",
      data:
        populatedMember,
    });
  } catch (error) {
    console.error(
      "Erreur createMember :",
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
// LISTE DES MEMBRES
// ======================================================

const getMembers = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const page =
      parseInt(
        req.query.page,
        10
      ) || 1;

    const limit =
      parseInt(
        req.query.limit,
        10
      ) || 10;

    const skip =
      (page - 1) * limit;

    const {
      search,
      gender,
      department,
      status,
    } = req.query;

    const filter = {
      church: req.churchId,
    };

    if (gender) {
      filter.gender = gender;
    }

    if (department) {
      filter.department = department;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        {
          firstName: {
            $regex: search,
            $options: "i",
          },
        },
        {
          lastName: {
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
        {
          phone: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const total =
      await Member.countDocuments(
        filter
      );

    const members =
      await Member.find(filter)
        .populate(
          "department",
          "name description leader status"
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
        Math.ceil(
          total / limit
        ),

      count:
        members.length,

      data:
        members,
    });
  } catch (error) {
    console.error(
      "Erreur getMembers :",
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
// DÉTAIL D'UN MEMBRE
// ======================================================

const getMemberById = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID membre invalide",
      });
    }

    const member =
      await Member.findOne({
        _id: id,
        church:
          req.churchId,
      }).populate(
        "department",
        "name description leader status"
      );

    if (!member) {
      return res.status(404).json({
        success: false,
        message:
          "Membre introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      data:
        member,
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
// MODIFIER UN MEMBRE
// ======================================================

const updateMember = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID membre invalide",
      });
    }

    const member =
      await Member.findOne({
        _id: id,
        church:
          req.churchId,
      });

    if (!member) {
      return res.status(404).json({
        success: false,
        message:
          "Membre introuvable",
      });
    }

    const {
      firstName,
      lastName,
      gender,
      phone,
      email,
      address,
      department,
      status,
    } = req.body;

    if (
      typeof department !==
      "undefined"
    ) {
      if (department) {
        if (
          !mongoose.Types.ObjectId.isValid(
            department
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "ID département invalide",
          });
        }

        const departmentExists =
          await Department.findOne({
            _id:
              department,

            church:
              req.churchId,
          });

        if (!departmentExists) {
          return res.status(404).json({
            success: false,
            message:
              "Département introuvable pour cette église",
          });
        }

        member.department =
          department;
      } else {
        member.department =
          null;
      }
    }

    if (
      typeof firstName !==
      "undefined"
    ) {
      member.firstName =
        firstName.trim();
    }

    if (
      typeof lastName !==
      "undefined"
    ) {
      member.lastName =
        lastName.trim();
    }

    if (
      typeof gender !==
      "undefined"
    ) {
      member.gender =
        gender;
    }

    if (
      typeof phone !==
      "undefined"
    ) {
      member.phone =
        phone.trim();
    }

    if (
      typeof email !==
      "undefined"
    ) {
      member.email =
        email
          .trim()
          .toLowerCase();
    }

    if (
      typeof address !==
      "undefined"
    ) {
      member.address =
        address.trim();
    }

    if (
      typeof status !==
      "undefined"
    ) {
      member.status =
        status;
    }

    await member.save();

    const updatedMember =
      await Member.findOne({
        _id: member._id,
        church:
          req.churchId,
      }).populate(
        "department",
        "name description leader status"
      );

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Member",
      entityId:
        member._id,

      description:
        `Modification du membre ${member.firstName} ${member.lastName}`,
    });

    return res.status(200).json({
      success: true,
      message:
        "Membre mis à jour avec succès",
      data:
        updatedMember,
    });
  } catch (error) {
    console.error(
      "Erreur updateMember :",
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
// SUPPRIMER UN MEMBRE
// ======================================================

const deleteMember = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID membre invalide",
      });
    }

    const member =
      await Member.findOne({
        _id: id,
        church:
          req.churchId,
      });

    if (!member) {
      return res.status(404).json({
        success: false,
        message:
          "Membre introuvable",
      });
    }

    const memberName =
      `${member.firstName} ${member.lastName}`;

    await member.deleteOne();

    await createActivityLog({
      req,
      action: "DELETE",
      entity: "Member",
      entityId: id,

      description:
        `Suppression du membre ${memberName}`,
    });

    return res.status(200).json({
      success: true,
      message:
        "Membre supprimé avec succès",
    });
  } catch (error) {
    console.error(
      "Erreur deleteMember :",
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
// EXPORTS
// ======================================================

module.exports = {
  createMember,
  getMembers,
  getMemberById,
  updateMember,
  deleteMember,
};