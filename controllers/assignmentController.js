const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Member = require("../models/Member");
const Event = require("../models/Event");
const Department = require("../models/Department");
const createActivityLog = require("../utils/createActivityLog");

// Créer une programmation
const createAssignment = async (req, res) => {
  try {
    const {
      member,
      event,
      department,
      role,
      note,
    } = req.body;

    if (!member || !event || !role) {
      return res.status(400).json({
        success: false,
        message: "Membre, événement et rôle sont requis",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(member) ||
      !mongoose.Types.ObjectId.isValid(event)
    ) {
      return res.status(400).json({
        success: false,
        message: "ID membre ou événement invalide",
      });
    }

    const memberExists = await Member.findById(member);
    const eventExists = await Event.findById(event);

    if (!memberExists) {
      return res.status(404).json({
        success: false,
        message: "Membre introuvable",
      });
    }

    if (!eventExists) {
      return res.status(404).json({
        success: false,
        message: "Événement introuvable",
      });
    }

    if (department) {
      const departmentExists = await Department.findById(department);

      if (!departmentExists) {
        return res.status(404).json({
          success: false,
          message: "Département introuvable",
        });
      }
    }

    const existingAssignment = await Assignment.findOne({
      member,
      event,
      role,
    });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message:
          "Ce membre est déjà programmé pour ce rôle sur cet événement",
      });
    }

    const assignment = await Assignment.create({
      member,
      event,
      department: department || null,
      role,
      note: note || "",
      createdBy: req.user?._id || null,
    });

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate("member", "firstName lastName email phone")
      .populate("event", "title date type location status")
      .populate("department", "name")
      .populate("createdBy", "name email role");

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "Assignment",
      entityId: assignment._id,
      description: `Programmation de ${memberExists.firstName || ""} ${
        memberExists.lastName || ""
      } pour ${eventExists.title || ""} - rôle : ${role}`.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Programmation créée avec succès",
      data: populatedAssignment,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "Ce membre est déjà programmé pour ce rôle sur cet événement",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Liste des programmations avec filtres et pagination
const getAssignments = async (req, res) => {
  try {
    const {
      event,
      member,
      department,
      status,
      search,
    } = req.query;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};

    if (event) filter.event = event;
    if (member) filter.member = member;
    if (department) filter.department = department;
    if (status) filter.status = status;

    if (search) {
      filter.role = {
        $regex: search,
        $options: "i",
      };
    }

    const total = await Assignment.countDocuments(filter);

    const assignments = await Assignment.find(filter)
      .populate("member", "firstName lastName email phone status")
      .populate("event", "title date type location status")
      .populate("department", "name leader status")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Détail d'une programmation
const getAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID programmation invalide",
      });
    }

    const assignment = await Assignment.findById(id)
      .populate("member")
      .populate("event")
      .populate("department")
      .populate("createdBy", "name email role");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Programmation introuvable",
      });
    }

    res.status(200).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Modifier une programmation
const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID programmation invalide",
      });
    }

    const assignment = await Assignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Programmation introuvable",
      });
    }

    const allowedFields = [
      "member",
      "event",
      "department",
      "role",
      "note",
      "status",
    ];

    allowedFields.forEach((field) => {
      if (typeof req.body[field] !== "undefined") {
        assignment[field] = req.body[field];
      }
    });

    if (assignment.status === "confirmed" && !assignment.confirmedAt) {
      assignment.confirmedAt = new Date();
      assignment.declinedAt = null;
    }

    if (assignment.status === "declined" && !assignment.declinedAt) {
      assignment.declinedAt = new Date();
      assignment.confirmedAt = null;
    }

    if (assignment.status === "pending") {
      assignment.confirmedAt = null;
      assignment.declinedAt = null;
    }

    await assignment.save();

    const populatedAssignment = await Assignment.findById(id)
      .populate("member", "firstName lastName email phone")
      .populate("event", "title date type location status")
      .populate("department", "name")
      .populate("createdBy", "name email role");

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Assignment",
      entityId: assignment._id,
      description: `Modification d'une programmation - rôle : ${
        assignment.role || ""
      }`,
    });

    res.status(200).json({
      success: true,
      message: "Programmation mise à jour avec succès",
      data: populatedAssignment,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "Cette programmation existe déjà pour ce membre, cet événement et ce rôle",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Supprimer une programmation
const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID programmation invalide",
      });
    }

    const assignment = await Assignment.findById(id)
      .populate("member", "firstName lastName")
      .populate("event", "title");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Programmation introuvable",
      });
    }

    await assignment.deleteOne();

    await createActivityLog({
      req,
      action: "DELETE",
      entity: "Assignment",
      entityId: id,
      description: `Suppression de la programmation de ${
        assignment.member?.firstName || ""
      } ${assignment.member?.lastName || ""} pour ${
        assignment.event?.title || ""
      }`.trim(),
    });

    res.status(200).json({
      success: true,
      message: "Programmation supprimée avec succès",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Confirmer une programmation
const confirmAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await Assignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Programmation introuvable",
      });
    }

    assignment.status = "confirmed";
    assignment.confirmedAt = new Date();
    assignment.declinedAt = null;

    await assignment.save();

    res.status(200).json({
      success: true,
      message: "Participation confirmée",
      data: assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Refuser une programmation
const declineAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await Assignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Programmation introuvable",
      });
    }

    assignment.status = "declined";
    assignment.declinedAt = new Date();
    assignment.confirmedAt = null;

    await assignment.save();

    res.status(200).json({
      success: true,
      message: "Participation refusée",
      data: assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Résumé global
const getAssignmentStats = async (req, res) => {
  try {
    const total = await Assignment.countDocuments();
    const pending = await Assignment.countDocuments({ status: "pending" });
    const confirmed = await Assignment.countDocuments({
      status: "confirmed",
    });
    const declined = await Assignment.countDocuments({
      status: "declined",
    });
    const cancelled = await Assignment.countDocuments({
      status: "cancelled",
    });

    res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        confirmed,
        declined,
        cancelled,
        confirmationRate:
          total > 0
            ? Number(((confirmed / total) * 100).toFixed(2))
            : 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  confirmAssignment,
  declineAssignment,
  getAssignmentStats,
};