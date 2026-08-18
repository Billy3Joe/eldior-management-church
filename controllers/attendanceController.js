const Attendance = require("../models/Attendance");
const Member = require("../models/Member");
const Event = require("../models/Event");
const mongoose = require("mongoose");

// Créer une présence simple
const createAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.create(req.body);

    res.status(201).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Marquer ou mettre à jour la présence d'un membre pour un événement
const markAttendance = async (req, res) => {
  try {
    const { memberId, eventId, status } = req.body;

    if (!memberId || !eventId || !status) {
      return res.status(400).json({
        success: false,
        message: "memberId, eventId et status sont requis",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(memberId) ||
      !mongoose.Types.ObjectId.isValid(eventId)
    ) {
      return res.status(400).json({
        success: false,
        message: "memberId ou eventId invalide",
      });
    }

    const memberExists = await Member.findById(memberId);
    const eventExists = await Event.findById(eventId);

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

    const attendance = await Attendance.findOneAndUpdate(
      { memberId, eventId },
      { status },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Liste paginée des présences
const getAttendances = async (req, res) => {
  try {
    const { status, memberId, eventId } = req.query;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};

    if (status) filter.status = status;
    if (memberId) filter.memberId = memberId;
    if (eventId) filter.eventId = eventId;

    const total = await Attendance.countDocuments(filter);

    const attendances = await Attendance.find(filter)
      .populate("memberId")
      .populate("eventId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: attendances.length,
      data: attendances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Une présence par ID
const getAttendanceById = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate("memberId")
      .populate("eventId");

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Présence introuvable",
      });
    }

    res.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Modifier une présence
const updateAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Présence introuvable",
      });
    }

    res.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Supprimer une présence
const deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Présence introuvable",
      });
    }

    res.status(200).json({
      success: true,
      message: "Présence supprimée avec succès",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Retourne tous les membres avec leur statut pour un événement
const getAttendanceByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({
        success: false,
        message: "eventId invalide",
      });
    }

    const members = await Member.find().populate("department").sort({
      firstName: 1,
      lastName: 1,
    });

    const attendances = await Attendance.find({ eventId });

    const attendanceMap = new Map();
    attendances.forEach((item) => {
      attendanceMap.set(String(item.memberId), item.status);
    });

    const data = members.map((member) => ({
      member,
      status: attendanceMap.get(String(member._id)) || "Non marqué",
    }));

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Résumé de présence pour un événement
const getAttendanceSummaryByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({
        success: false,
        message: "eventId invalide",
      });
    }

    const totalMembers = await Member.countDocuments();

    const present = await Attendance.countDocuments({
      eventId,
      status: "Présent",
    });

    const absent = await Attendance.countDocuments({
      eventId,
      status: "Absent",
    });

    const excused = await Attendance.countDocuments({
      eventId,
      status: "Excusé",
    });

    const marked = present + absent + excused;
    const notMarked = Math.max(totalMembers - marked, 0);

    res.status(200).json({
      success: true,
      data: {
        totalMembers,
        present,
        absent,
        excused,
        notMarked,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Analytics globales
const getAttendanceAnalytics = async (req, res) => {
  try {
    const { period = "all", startDate, endDate } = req.query;

    const totalMembers = await Member.countDocuments();

    let dateFilter = {};

    const now = new Date();

    if (period === "week") {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      startOfWeek.setDate(startOfWeek.getDate() + diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: startOfWeek,
          $lte: endOfWeek,
        },
      };
    } else if (period === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: startOfMonth,
          $lte: endOfMonth,
        },
      };
    } else if (period === "year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      startOfYear.setHours(0, 0, 0, 0);

      const endOfYear = new Date(now.getFullYear(), 11, 31);
      endOfYear.setHours(23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: startOfYear,
          $lte: endOfYear,
        },
      };
    } else if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: start,
          $lte: end,
        },
      };
    }

    const events = await Event.find(dateFilter).sort({ date: -1 });

    const eventIds = events.map((event) => event._id);

    const attendanceFilter =
      eventIds.length > 0 ? { eventId: { $in: eventIds } } : { eventId: null };

    const totalAttendances = await Attendance.countDocuments(attendanceFilter);

    const presentCount = await Attendance.countDocuments({
      ...attendanceFilter,
      status: "Présent",
    });

    const absentCount = await Attendance.countDocuments({
      ...attendanceFilter,
      status: "Absent",
    });

    const excusedCount = await Attendance.countDocuments({
      ...attendanceFilter,
      status: "Excusé",
    });

    const eventsAnalytics = await Promise.all(
      events.map(async (event) => {
        const present = await Attendance.countDocuments({
          eventId: event._id,
          status: "Présent",
        });

        const absent = await Attendance.countDocuments({
          eventId: event._id,
          status: "Absent",
        });

        const excused = await Attendance.countDocuments({
          eventId: event._id,
          status: "Excusé",
        });

        const marked = present + absent + excused;
        const notMarked = Math.max(totalMembers - marked, 0);

        const attendanceRate =
          totalMembers > 0
            ? Number(((present / totalMembers) * 100).toFixed(2))
            : 0;

        return {
          eventId: event._id,
          title: event.title,
          date: event.date,
          type: event.type || "",
          status: event.status || "",
          present,
          absent,
          excused,
          notMarked,
          attendanceRate,
        };
      })
    );

    const bestAttendanceEvent =
      eventsAnalytics.length > 0
        ? [...eventsAnalytics].sort(
            (a, b) => b.attendanceRate - a.attendanceRate
          )[0]
        : null;

    res.status(200).json({
      success: true,
      data: {
        period,
        startDate: startDate || null,
        endDate: endDate || null,
        overview: {
          totalMembers,
          totalAttendances,
          presentCount,
          absentCount,
          excusedCount,
        },
        bestAttendanceEvent,
        eventsAnalytics,
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
  createAttendance,
  markAttendance,
  getAttendances,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getAttendanceByEvent,
  getAttendanceSummaryByEvent,
  getAttendanceAnalytics,
};