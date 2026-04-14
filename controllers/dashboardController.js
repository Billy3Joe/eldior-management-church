const Member = require("../models/Member");
const Event = require("../models/Event");
const Attendance = require("../models/Attendance");
const Department = require("../models/Department");

const getDashboardStats = async (req, res) => {
  try {
    const totalMembers = await Member.countDocuments();
    const totalDepartments = await Department.countDocuments();
    const totalEvents = await Event.countDocuments();
    const totalAttendances = await Attendance.countDocuments();

    const activeMembers = await Member.countDocuments({ status: "Actif" });
    const inactiveMembers = await Member.countDocuments({ status: "Inactif" });

    const plannedEvents = await Event.countDocuments({ status: "Prévu" });
    const completedEvents = await Event.countDocuments({ status: "Terminé" });
    const cancelledEvents = await Event.countDocuments({ status: "Annulé" });

    const departments = await Department.find().sort({ name: 1 });

    const membersByDepartment = await Promise.all(
      departments.map(async (department) => {
        const total = await Member.countDocuments({
          department: department._id,
        });

        const active = await Member.countDocuments({
          department: department._id,
          status: "Actif",
        });

        const inactive = await Member.countDocuments({
          department: department._id,
          status: "Inactif",
        });

        return {
          _id: department._id,
          name: department.name,
          leader: department.leader,
          status: department.status,
          totalMembers: total,
          activeMembers: active,
          inactiveMembers: inactive,
        };
      })
    );

    const recentMembers = await Member.find()
      .populate("department")
      .sort({ createdAt: -1 })
      .limit(5);

    const recentEvents = await Event.find()
      .sort({ createdAt: -1 })
      .limit(5);

    const recentAttendances = await Attendance.find()
      .populate("memberId")
      .populate("eventId")
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalMembers,
          totalDepartments,
          totalEvents,
          totalAttendances,
        },
        members: {
          activeMembers,
          inactiveMembers,
        },
        events: {
          plannedEvents,
          completedEvents,
          cancelledEvents,
        },
        membersByDepartment,
        recentActivity: {
          recentMembers,
          recentEvents,
          recentAttendances,
        },
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
  getDashboardStats,
};