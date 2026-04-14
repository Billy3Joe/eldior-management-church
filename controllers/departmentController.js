const Department = require("../models/Department");
const Member = require("../models/Member");

const createDepartment = async (req, res) => {
  try {
    const { name, description, leader, status } = req.body;

    const existingDepartment = await Department.findOne({ name });

    if (existingDepartment) {
      return res.status(400).json({
        success: false,
        message: "Ce département existe déjà",
      });
    }

    const department = await Department.create({
      name,
      description,
      leader,
      status,
    });

    res.status(201).json({
      success: true,
      data: department,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getDepartments = async (req, res) => {
  try {
    const { search, status, leader } = req.query;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { leader: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      filter.status = status;
    }

    if (leader) {
      filter.leader = { $regex: leader, $options: "i" };
    }

    const total = await Department.countDocuments(filter);

    const departments = await Department.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getDepartmentById = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Département introuvable",
      });
    }

    res.status(200).json({
      success: true,
      data: department,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateDepartment = async (req, res) => {
  try {
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Département introuvable",
      });
    }

    res.status(200).json({
      success: true,
      message: "Département mis à jour avec succès",
      data: department,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findByIdAndDelete(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Département introuvable",
      });
    }

    res.status(200).json({
      success: true,
      message: "Département supprimé avec succès",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getDepartmentStats = async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 });

    const stats = await Promise.all(
      departments.map(async (department) => {
        const totalMembers = await Member.countDocuments({
          department: department._id,
        });

        const activeMembers = await Member.countDocuments({
          department: department._id,
          status: "Actif",
        });

        const inactiveMembers = await Member.countDocuments({
          department: department._id,
          status: "Inactif",
        });

        return {
          _id: department._id,
          name: department.name,
          description: department.description,
          leader: department.leader,
          status: department.status,
          totalMembers,
          activeMembers,
          inactiveMembers,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: stats.length,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getDepartmentWithMembers = async (req, res) => {
  try {
    const departmentId = req.params.id;

    const department = await Department.findById(departmentId);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Département introuvable",
      });
    }

    const members = await Member.find({ department: departmentId })
      .populate("department")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      department,
      membersCount: members.length,
      members,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
const getDepartmentDetails = async (req, res) => {
  try {
    const departmentId = req.params.id;

    const department = await Department.findById(departmentId);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Département introuvable",
      });
    }

    const members = await Member.find({ department: departmentId })
      .populate("department")
      .sort({ firstName: 1, lastName: 1 });

    res.status(200).json({
      success: true,
      data: {
        department,
        membersCount: members.length,
        members,
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
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  getDepartmentStats,
  getDepartmentWithMembers,
  getDepartmentDetails,
};