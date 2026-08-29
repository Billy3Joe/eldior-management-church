const Member = require("../models/Member");
const Department = require("../models/Department");
const Event = require("../models/Event");
const Attendance = require("../models/Attendance");
const Assignment = require("../models/Assignment");

// ======================================================
// DASHBOARD GLOBAL
// ======================================================

const getDashboard = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const churchFilter = {
      church: req.churchId,
    };

    const now = new Date();

    // ==================================================
    // STATISTIQUES PRINCIPALES
    // ==================================================

    const [
      totalMembers,
      activeMembers,
      inactiveMembers,

      totalDepartments,
      activeDepartments,

      totalEvents,
      upcomingEvents,

      totalAttendances,
      presentAttendances,
      absentAttendances,

      totalAssignments,
      pendingAssignments,
      confirmedAssignments,
      declinedAssignments,
    ] = await Promise.all([
      Member.countDocuments(
        churchFilter
      ),

      Member.countDocuments({
        ...churchFilter,
        status: "Actif",
      }),

      Member.countDocuments({
        ...churchFilter,
        status: "Inactif",
      }),

      Department.countDocuments(
        churchFilter
      ),

      Department.countDocuments({
        ...churchFilter,
        status: "Actif",
      }),

      Event.countDocuments(
        churchFilter
      ),

      Event.countDocuments({
        ...churchFilter,
        date: {
          $gte: now,
        },
        status: {
          $ne: "Annulé",
        },
      }),

      Attendance.countDocuments(
        churchFilter
      ),

      Attendance.countDocuments({
        ...churchFilter,
        status: "Présent",
      }),

      Attendance.countDocuments({
        ...churchFilter,
        status: "Absent",
      }),

      Assignment.countDocuments(
        churchFilter
      ),

      Assignment.countDocuments({
        ...churchFilter,
        status: "pending",
      }),

      Assignment.countDocuments({
        ...churchFilter,
        status: "confirmed",
      }),

      Assignment.countDocuments({
        ...churchFilter,
        status: "declined",
      }),
    ]);

    // ==================================================
    // TAUX DE PRÉSENCE
    // ==================================================

    const attendanceRate =
      totalAttendances > 0
        ? Number(
            (
              (presentAttendances /
                totalAttendances) *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // TAUX CONFIRMATION PROGRAMMATIONS
    // ==================================================

    const assignmentConfirmationRate =
      totalAssignments > 0
        ? Number(
            (
              (confirmedAssignments /
                totalAssignments) *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // PROCHAINS ÉVÉNEMENTS
    // ==================================================

    const nextEvents =
      await Event.find({
        ...churchFilter,
        date: {
          $gte: now,
        },
        status: {
          $ne: "Annulé",
        },
      })
        .sort({
          date: 1,
        })
        .limit(5);

    // ==================================================
    // MEMBRES RÉCENTS
    // ==================================================

    const recentMembers =
      await Member.find(
        churchFilter
      )
        .populate(
          "department",
          "name"
        )
        .sort({
          createdAt: -1,
        })
        .limit(5);

    // ==================================================
    // PROGRAMMATIONS RÉCENTES
    // ==================================================

    const recentAssignments =
      await Assignment.find(
        churchFilter
      )
        .populate(
          "member",
          "firstName lastName"
        )
        .populate(
          "event",
          "title date"
        )
        .populate(
          "department",
          "name"
        )
        .sort({
          createdAt: -1,
        })
        .limit(5);

    // ==================================================
    // RÉPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      data: {
        members: {
          total: totalMembers,
          active: activeMembers,
          inactive: inactiveMembers,
        },

        departments: {
          total: totalDepartments,
          active: activeDepartments,
        },

        events: {
          total: totalEvents,
          upcoming: upcomingEvents,
        },

        attendances: {
          total: totalAttendances,
          present: presentAttendances,
          absent: absentAttendances,
          attendanceRate,
        },

        assignments: {
          total: totalAssignments,
          pending: pendingAssignments,
          confirmed:
            confirmedAssignments,
          declined:
            declinedAssignments,
          confirmationRate:
            assignmentConfirmationRate,
        },

        nextEvents,
        recentMembers,
        recentAssignments,
      },
    });
  } catch (error) {
    console.error(
      "Erreur getDashboard :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

module.exports = {
  getDashboard,
};