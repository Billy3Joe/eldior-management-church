const mongoose = require("mongoose");

const Attendance = require("../models/Attendance");
const Member = require("../models/Member");
const Event = require("../models/Event");

const createActivityLog = require(
  "../utils/createActivityLog"
);

// ======================================================
// MARQUER UNE PRÉSENCE
// ======================================================

const markAttendance = async (req, res) => {
  try {
    const {
      member,
      event,
      status,
      note,
    } = req.body;

    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    if (!member || !event) {
      return res.status(400).json({
        success: false,
        message:
          "Le membre et l'événement sont obligatoires",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(member) ||
      !mongoose.Types.ObjectId.isValid(event)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID membre ou événement invalide",
      });
    }

    const memberExists = await Member.findOne({
      _id: member,
      church: req.churchId,
    });

    if (!memberExists) {
      return res.status(404).json({
        success: false,
        message:
          "Membre introuvable dans cette église",
      });
    }

    const eventExists = await Event.findOne({
      _id: event,
      church: req.churchId,
    });

    if (!eventExists) {
      return res.status(404).json({
        success: false,
        message:
          "Événement introuvable dans cette église",
      });
    }

    const existingAttendance =
      await Attendance.findOne({
        church: req.churchId,
        member,
        event,
      });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message:
          "La présence de ce membre est déjà enregistrée pour cet événement",
      });
    }

    const attendance =
      await Attendance.create({
        church: req.churchId,
        member,
        event,

        status:
          status || "Présent",

        note:
          note?.trim() || "",

        markedBy:
          req.user?._id || null,

        markedAt:
          new Date(),
      });

    const populatedAttendance =
      await Attendance.findOne({
        _id: attendance._id,
        church: req.churchId,
      })
        .populate(
          "member",
          "firstName lastName email phone"
        )
        .populate(
          "event",
          "title date location type status"
        )
        .populate(
          "markedBy",
          "name email role"
        );

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "Attendance",
      entityId: attendance._id,
      description:
        `Présence enregistrée pour ${memberExists.firstName} ${memberExists.lastName} - ${eventExists.title}`,
    });

    return res.status(201).json({
      success: true,
      message:
        "Présence enregistrée avec succès",
      data:
        populatedAttendance,
    });
  } catch (error) {
    console.error(
      "Erreur markAttendance :",
      error
    );

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "Cette présence existe déjà",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// ======================================================
// LISTE DES PRÉSENCES
// ======================================================

const getAttendances = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const page =
      parseInt(req.query.page, 10) || 1;

    const limit =
      parseInt(req.query.limit, 10) || 10;

    const skip =
      (page - 1) * limit;

    const {
      member,
      event,
      status,
    } = req.query;

    const filter = {
      church: req.churchId,
    };

    if (member) {
      filter.member = member;
    }

    if (event) {
      filter.event = event;
    }

    if (status) {
      filter.status = status;
    }

    const total =
      await Attendance.countDocuments(filter);

    const attendances =
      await Attendance.find(filter)
        .populate(
          "member",
          "firstName lastName email phone"
        )
        .populate(
          "event",
          "title date location type status"
        )
        .populate(
          "markedBy",
          "name email role"
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
        Math.ceil(total / limit),
      count:
        attendances.length,
      data:
        attendances,
    });
  } catch (error) {
    console.error(
      "Erreur getAttendances :",
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
// PRÉSENCES PAR ÉVÉNEMENT
// ======================================================

const getAttendancesByEvent = async (
  req,
  res
) => {
  try {
    const { eventId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(eventId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID événement invalide",
      });
    }

    const event =
      await Event.findOne({
        _id: eventId,
        church: req.churchId,
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
        church: req.churchId,
        event: eventId,
      })
        .populate(
          "member",
          "firstName lastName email phone department"
        )
        .populate(
          "markedBy",
          "name email role"
        )
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count:
        attendances.length,
      data:
        attendances,
    });
  } catch (error) {
    console.error(
      "Erreur getAttendancesByEvent :",
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
// DÉTAIL D'UNE PRÉSENCE
// ======================================================

const getAttendanceById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID présence invalide",
      });
    }

    const attendance =
      await Attendance.findOne({
        _id: id,
        church: req.churchId,
      })
        .populate(
          "member",
          "firstName lastName email phone"
        )
        .populate(
          "event",
          "title date location type status"
        )
        .populate(
          "markedBy",
          "name email role"
        );

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message:
          "Présence introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      data:
        attendance,
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
// MODIFIER UNE PRÉSENCE
// ======================================================

const updateAttendance = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID présence invalide",
      });
    }

    const attendance =
      await Attendance.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message:
          "Présence introuvable",
      });
    }

    const {
      status,
      note,
    } = req.body;

    if (
      typeof status !== "undefined"
    ) {
      attendance.status = status;
    }

    if (
      typeof note !== "undefined"
    ) {
      attendance.note =
        note.trim();
    }

    attendance.markedBy =
      req.user?._id ||
      attendance.markedBy;

    attendance.markedAt =
      new Date();

    await attendance.save();

    const updatedAttendance =
      await Attendance.findOne({
        _id: attendance._id,
        church: req.churchId,
      })
        .populate(
          "member",
          "firstName lastName email phone"
        )
        .populate(
          "event",
          "title date location type status"
        )
        .populate(
          "markedBy",
          "name email role"
        );

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Attendance",
      entityId: attendance._id,
      description:
        `Modification d'une présence - statut : ${attendance.status}`,
    });

    return res.status(200).json({
      success: true,
      message:
        "Présence mise à jour avec succès",
      data:
        updatedAttendance,
    });
  } catch (error) {
    console.error(
      "Erreur updateAttendance :",
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
// SUPPRIMER UNE PRÉSENCE
// ======================================================

const deleteAttendance = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID présence invalide",
      });
    }

    const attendance =
      await Attendance.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message:
          "Présence introuvable",
      });
    }

    await attendance.deleteOne();

    await createActivityLog({
      req,
      action: "DELETE",
      entity: "Attendance",
      entityId: id,
      description:
        "Suppression d'une présence",
    });

    return res.status(200).json({
      success: true,
      message:
        "Présence supprimée avec succès",
    });
  } catch (error) {
    console.error(
      "Erreur deleteAttendance :",
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
// RÉSUMÉ DES PRÉSENCES
// ======================================================

const getAttendanceSummary = async (
  req,
  res
) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const { event } = req.query;

    const baseFilter = {
      church: req.churchId,
    };

    if (event) {
      baseFilter.event = event;
    }

    const [
      total,
      present,
      absent,
      excused,
      late,
    ] = await Promise.all([
      Attendance.countDocuments(
        baseFilter
      ),

      Attendance.countDocuments({
        ...baseFilter,
        status: "Présent",
      }),

      Attendance.countDocuments({
        ...baseFilter,
        status: "Absent",
      }),

      Attendance.countDocuments({
        ...baseFilter,
        status: "Excusé",
      }),

      Attendance.countDocuments({
        ...baseFilter,
        status: "En retard",
      }),
    ]);

    const attendanceRate =
      total > 0
        ? Number(
            (
              (present / total) *
              100
            ).toFixed(2)
          )
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        total,
        present,
        absent,
        excused,
        late,
        attendanceRate,
      },
    });
  } catch (error) {
    console.error(
      "Erreur getAttendanceSummary :",
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
  markAttendance,
  getAttendances,
  getAttendancesByEvent,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary,
};