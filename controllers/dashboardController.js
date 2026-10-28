
const mongoose = require("mongoose");

const Member = require("../models/Member");
const Department = require("../models/Department");
const Event = require("../models/Event");
const Attendance = require("../models/Attendance");
const Assignment = require("../models/Assignment");
const Family = require("../models/Family");
const Group = require("../models/Group");
const User = require("../models/User");

// ======================================================
// TABLEAU DE BORD GÉNÉRAL DE L'ÉGLISE
// ======================================================

const getDashboard = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message: "Aucune église associée à cet utilisateur",
      });
    }

    const churchId = req.churchId;
    const churchFilter = { church: churchId };
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

      totalFamilies,
      activeFamilies,

      totalGroups,
      activeGroups,
      pausedGroups,

      totalVisitors,
      visitorsToFollowUp,
      integratedVisitors,

      totalUsers,
    ] = await Promise.all([
      // MEMBRES
      Member.countDocuments({
        ...churchFilter,
        membershipType: { $ne: "Visiteur" },
      }),

      Member.countDocuments({
        ...churchFilter,
        membershipType: { $ne: "Visiteur" },
        status: "Actif",
      }),

      Member.countDocuments({
        ...churchFilter,
        membershipType: { $ne: "Visiteur" },
        status: "Inactif",
      }),

      // DÉPARTEMENTS
      Department.countDocuments(churchFilter),

      Department.countDocuments({
        ...churchFilter,
        status: "active",
      }),

      // ÉVÉNEMENTS
      Event.countDocuments(churchFilter),

      Event.countDocuments({
        ...churchFilter,
        date: { $gte: now },
        status: { $ne: "Annulé" },
      }),

      // PRÉSENCES
      Attendance.countDocuments(churchFilter),

      Attendance.countDocuments({
        ...churchFilter,
        status: "Présent",
      }),

      Attendance.countDocuments({
        ...churchFilter,
        status: "Absent",
      }),

      // AFFECTATIONS
      Assignment.countDocuments(churchFilter),

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

      // FAMILLES
      Family.countDocuments(churchFilter),

      Family.countDocuments({
        ...churchFilter,
        isActive: true,
      }),

      // GROUPES / CELLULES
      Group.countDocuments(churchFilter),

      Group.countDocuments({
        ...churchFilter,
        status: "Actif",
      }),

      Group.countDocuments({
        ...churchFilter,
        status: "En pause",
      }),

      // VISITEURS
      Member.countDocuments({
        ...churchFilter,
        membershipType: "Visiteur",
      }),

      Member.countDocuments({
        ...churchFilter,
        membershipType: "Visiteur",
        followUpStatus: {
          $in: [
            "Non commencé",
            "À contacter",
            "En suivi",
          ],
        },
      }),

      Member.countDocuments({
        ...churchFilter,
        membershipType: "Membre",
        wasVisitor: true,
      }),

      // UTILISATEURS
      User.countDocuments({
        isActive: true,
        $or: [
          { church: churchId },
          {
            churchMemberships: {
              $elemMatch: {
                church: churchId,
                isActive: true,
              },
            },
          },
        ],
      }),
    ]);

    // ==================================================
    // TAUX
    // ==================================================

    const attendanceRate =
      totalAttendances > 0
        ? Number(
            (
              (presentAttendances / totalAttendances) *
              100
            ).toFixed(2)
          )
        : 0;

    const assignmentConfirmationRate =
      totalAssignments > 0
        ? Number(
            (
              (confirmedAssignments / totalAssignments) *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // MEMBRES PAR DÉPARTEMENT
    // Source : Department.members
    // ==================================================

    const departments = await Department.find(
      churchFilter
    )
      .select("name members")
      .lean();

    const memberIds = [
      ...new Set(
        departments.flatMap((department) =>
          (department.members || [])
            .filter((entry) => entry.isActive !== false)
            .map((entry) => String(entry.member))
        )
      ),
    ].filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );

    const departmentMembers = memberIds.length
      ? await Member.find({
          ...churchFilter,
          _id: {
            $in: memberIds.map(
              (id) => new mongoose.Types.ObjectId(id)
            ),
          },
          membershipType: { $ne: "Visiteur" },
        })
          .select("_id status")
          .lean()
      : [];

    const memberStatusMap = new Map(
      departmentMembers.map((member) => [
        String(member._id),
        member.status,
      ])
    );

    const membersByDepartment = departments.map(
      (department) => {
        const ids = [
          ...new Set(
            (department.members || [])
              .filter(
                (entry) => entry.isActive !== false
              )
              .map((entry) => String(entry.member))
          ),
        ];

        const statuses = ids
          .filter((id) => memberStatusMap.has(id))
          .map((id) => memberStatusMap.get(id));

        return {
          _id: department._id,
          name: department.name,
          totalMembers: statuses.length,
          activeMembers: statuses.filter(
            (status) => status === "Actif"
          ).length,
          inactiveMembers: statuses.filter(
            (status) => status === "Inactif"
          ).length,
        };
      }
    );

    // ==================================================
    // PROCHAINS ÉVÉNEMENTS
    // ==================================================

    const nextEvents = await Event.find({
      ...churchFilter,
      date: { $gte: now },
      status: { $ne: "Annulé" },
    })
      .sort({ date: 1 })
      .limit(5)
      .lean();

    // ==================================================
    // DERNIERS MEMBRES
    // ==================================================

    const recentMembers = await Member.find({
      ...churchFilter,
      membershipType: { $ne: "Visiteur" },
    })
      .populate("department", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // ==================================================
    // AFFECTATIONS RÉCENTES
    // ==================================================

    const recentAssignments = await Assignment.find(
      churchFilter
    )
      .populate("member", "firstName lastName")
      .populate("event", "title date")
      .populate("department", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // ==================================================
    // RÉPONSE API
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

        families: {
          total: totalFamilies,
          active: activeFamilies,
          inactive: totalFamilies - activeFamilies,
        },

        groups: {
          total: totalGroups,
          active: activeGroups,
          paused: pausedGroups,
          inactive:
            totalGroups - activeGroups - pausedGroups,
        },

        visitors: {
          total: totalVisitors,
          toFollowUp: visitorsToFollowUp,
          integrated: integratedVisitors,
        },

        users: {
          total: totalUsers,
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
          confirmed: confirmedAssignments,
          declined: declinedAssignments,
          confirmationRate:
            assignmentConfirmationRate,
        },

        membersByDepartment,
        nextEvents,
        recentMembers,
        recentAssignments,
      },
    });
  } catch (error) {
    console.error("Erreur getDashboard :", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Erreur lors du chargement du tableau de bord.",
    });
  }
};

module.exports = {
  getDashboard,
};
