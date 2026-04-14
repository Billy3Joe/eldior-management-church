const Attendance = require("../models/Attendance");
const Member = require("../models/Member");

const createAttendance = async (req, res) => {
  try {
    const { memberId, eventId, status } = req.body;

    const existingAttendance = await Attendance.findOne({
      memberId,
      eventId,
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: "Cette présence existe déjà pour ce membre et cet événement",
      });
    }

    const attendance = await Attendance.create({
      memberId,
      eventId,
      status,
    });

    res.status(201).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Doublon détecté : cette présence existe déjà",
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const markAttendance = async (req, res) => {
  try {
    const { memberId, eventId, status } = req.body;

    if (!memberId || !eventId) {
      return res.status(400).json({
        success: false,
        message: "memberId et eventId sont requis",
      });
    }

    const attendance = await Attendance.findOneAndUpdate(
      { memberId, eventId },
      { status: status || "Présent" },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    )
      .populate("memberId")
      .populate("eventId");

    res.status(200).json({
      success: true,
      message: "Présence enregistrée avec succès",
      data: attendance,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getAttendances = async (req, res) => {
  try {
    const { memberId, eventId, status } = req.query;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};

    if (memberId) {
      filter.memberId = memberId;
    }

    if (eventId) {
      filter.eventId = eventId;
    }

    if (status) {
      filter.status = status;
    }

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

const updateAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    )
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
      message: "Présence mise à jour avec succès",
      data: attendance,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

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

const getAttendanceByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const members = await Member.find().sort({ firstName: 1, lastName: 1 });
    const attendances = await Attendance.find({ eventId });

    const attendanceMap = {};
    attendances.forEach((attendance) => {
      attendanceMap[attendance.memberId.toString()] = attendance;
    });

    const result = members.map((member) => {
      const existingAttendance = attendanceMap[member._id.toString()];

      return {
        member: member,
        attendanceId: existingAttendance ? existingAttendance._id : null,
        status: existingAttendance ? existingAttendance.status : "Non marqué",
      };
    });

    res.status(200).json({
      success: true,
      eventId,
      count: result.length,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAttendanceSummaryByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const totalMembers = await Member.countDocuments();
    const attendances = await Attendance.find({ eventId });

    let present = 0;
    let absent = 0;
    let excused = 0;

    attendances.forEach((attendance) => {
      if (attendance.status === "Présent") {
        present++;
      } else if (attendance.status === "Absent") {
        absent++;
      } else if (attendance.status === "Excusé") {
        excused++;
      }
    });

    const marked = present + absent + excused;
    const notMarked = Math.max(totalMembers - marked, 0);

    res.status(200).json({
      success: true,
      data: {
        eventId,
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

module.exports = {
  createAttendance,
  markAttendance,
  getAttendances,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getAttendanceByEvent,
  getAttendanceSummaryByEvent,
};