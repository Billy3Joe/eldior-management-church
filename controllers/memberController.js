const Member = require("../models/Member");
const mongoose = require("mongoose");
const createActivityLog = require("../utils/createActivityLog");

// Créer un membre
const createMember = async (req, res) => {
  try {
    const member = await Member.create(req.body);

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "Member",
      entityId: member._id,
      description: `Création du membre ${member.firstName || ""} ${
        member.lastName || ""
      }`.trim(),
    });

    res.status(201).json({
      success: true,
      data: member,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Lire tous les membres avec filtres et pagination
const getMembers = async (req, res) => {
  try {
    const { search, department, status } = req.query;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (department) {
      filter.department = department;
    }

    if (status) {
      filter.status = status;
    }

    const total = await Member.countDocuments(filter);

    const members = await Member.find(filter)
      .populate("department")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: members.length,
      data: members,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Lire un membre par ID
const getMemberById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID membre invalide",
      });
    }

    const member = await Member.findById(id).populate("department");

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Membre introuvable",
      });
    }

    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Modifier un membre
const updateMember = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID membre invalide",
      });
    }

    const member = await Member.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    }).populate("department");

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Membre introuvable",
      });
    }

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Member",
      entityId: member._id,
      description: `Modification du membre ${member.firstName || ""} ${
        member.lastName || ""
      }`.trim(),
    });

    res.status(200).json({
      success: true,
      data: member,
      message: "Membre mis à jour avec succès",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Supprimer un membre
const deleteMember = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID membre invalide",
      });
    }

    const member = await Member.findByIdAndDelete(id);

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Membre introuvable",
      });
    }

    await createActivityLog({
      req,
      action: "DELETE",
      entity: "Member",
      entityId: id,
      description: `Suppression du membre ${member.firstName || ""} ${
        member.lastName || ""
      }`.trim(),
    });

    res.status(200).json({
      success: true,
      message: "Membre supprimé avec succès",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createMember,
  getMembers,
  getMemberById,
  updateMember,
  deleteMember,
};