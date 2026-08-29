const Member = require("../models/Member");
const Event = require("../models/Event");
const Attendance = require("../models/Attendance");
const Assignment = require("../models/Assignment");
const Department = require("../models/Department");

// ======================================================
// RAPPORT GLOBAL
// ======================================================

const getGlobalReport = async (req, res) => {
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

    const {
      startDate,
      endDate,
    } = req.query;

    const eventDateFilter = {};

    if (startDate) {
      eventDateFilter.$gte =
        new Date(startDate);
    }

    if (endDate) {
      const end =
        new Date(endDate);

      end.setHours(
        23,
        59,
        59,
        999
      );

      eventDateFilter.$lte =
        end;
    }

    const eventFilter = {
      ...churchFilter,
    };

    if (
      Object.keys(
        eventDateFilter
      ).length > 0
    ) {
      eventFilter.date =
        eventDateFilter;
    }

    // ==================================================
    // STATS PRINCIPALES
    // ==================================================

    const [
      totalMembers,
      activeMembers,
      totalDepartments,
      totalEvents,
      totalAttendances,
      totalAssignments,
      confirmedAssignments,
      declinedAssignments,
      pendingAssignments,
    ] = await Promise.all([
      Member.countDocuments(
        churchFilter
      ),

      Member.countDocuments({
        ...churchFilter,
        status: "Actif",
      }),

      Department.countDocuments(
        churchFilter
      ),

      Event.countDocuments(
        eventFilter
      ),

      Attendance.countDocuments(
        churchFilter
      ),

      Assignment.countDocuments(
        churchFilter
      ),

      Assignment.countDocuments({
        ...churchFilter,
        status: "confirmed",
      }),

      Assignment.countDocuments({
        ...churchFilter,
        status: "declined",
      }),

      Assignment.countDocuments({
        ...churchFilter,
        status: "pending",
      }),
    ]);

    // ==================================================
    // PRÉSENCES PAR STATUT
    // ==================================================

    const [
      present,
      absent,
      excused,
      late,
    ] = await Promise.all([
      Attendance.countDocuments({
        ...churchFilter,
        status: "Présent",
      }),

      Attendance.countDocuments({
        ...churchFilter,
        status: "Absent",
      }),

      Attendance.countDocuments({
        ...churchFilter,
        status: "Excusé",
      }),

      Attendance.countDocuments({
        ...churchFilter,
        status: "En retard",
      }),
    ]);

    const attendanceRate =
      totalAttendances > 0
        ? Number(
            (
              (present /
                totalAttendances) *
              100
            ).toFixed(2)
          )
        : 0;

    const confirmationRate =
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
    // ÉVÉNEMENTS
    // ==================================================

    const events =
      await Event.find(
        eventFilter
      )
        .sort({
          date: -1,
        })
        .limit(50);

    // ==================================================
    // DÉPARTEMENTS
    // ==================================================

    const departments =
      await Department.find(
        churchFilter
      ).sort({
        name: 1,
      });

    const departmentStats =
      [];

    for (
      const department of
      departments
    ) {
      const memberCount =
        await Member.countDocuments({
          church:
            req.churchId,

          department:
            department._id,
        });

      departmentStats.push({
        _id:
          department._id,

        name:
          department.name,

        leader:
          department.leader,

        memberCount,
      });
    }

    // ==================================================
    // RÉPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      data: {
        members: {
          total:
            totalMembers,

          active:
            activeMembers,
        },

        departments: {
          total:
            totalDepartments,

          details:
            departmentStats,
        },

        events: {
          total:
            totalEvents,

          data:
            events,
        },

        attendances: {
          total:
            totalAttendances,

          present,
          absent,
          excused,
          late,

          attendanceRate,
        },

        assignments: {
          total:
            totalAssignments,

          confirmed:
            confirmedAssignments,

          declined:
            declinedAssignments,

          pending:
            pendingAssignments,

          confirmationRate,
        },
      },
    });
  } catch (error) {
    console.error(
      "Erreur getGlobalReport :",
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
// RAPPORT D'UN ÉVÉNEMENT
// ======================================================

const getEventReport = async (
  req,
  res
) => {
  try {
    const { eventId } =
      req.params;

    const event =
      await Event.findOne({
        _id:
          eventId,

        church:
          req.churchId,
      });

    if (!event) {
      return res.status(404).json({
        success: false,
        message:
          "Événement introuvable",
      });
    }

    const attendances =
      await Attendance.find({
        church:
          req.churchId,

        event:
          event._id,
      }).populate(
        "member",
        "firstName lastName email"
      );

    const assignments =
      await Assignment.find({
        church:
          req.churchId,

        event:
          event._id,
      })
        .populate(
          "member",
          "firstName lastName email"
        )
        .populate(
          "department",
          "name"
        );

    const present =
      attendances.filter(
        (item) =>
          item.status ===
          "Présent"
      ).length;

    const absent =
      attendances.filter(
        (item) =>
          item.status ===
          "Absent"
      ).length;

    const confirmed =
      assignments.filter(
        (item) =>
          item.status ===
          "confirmed"
      ).length;

    const pending =
      assignments.filter(
        (item) =>
          item.status ===
          "pending"
      ).length;

    return res.status(200).json({
      success: true,

      data: {
        event,

        attendances: {
          total:
            attendances.length,

          present,
          absent,

          data:
            attendances,
        },

        assignments: {
          total:
            assignments.length,

          confirmed,
          pending,

          data:
            assignments,
        },
      },
    });
  } catch (error) {
    console.error(
      "Erreur getEventReport :",
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
  getGlobalReport,
  getEventReport,
};