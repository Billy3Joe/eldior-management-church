
const mongoose = require("mongoose");
const Event = require("../models/Event");
const createActivityLog = require("../utils/createActivityLog");

// ======================================================
// CRÉER UN ÉVÉNEMENT
// ======================================================

const createEvent = async (req, res) => {
  try {
    const {
      title,
      type,
      description,
      date,
      location,
      leader,
      status,
      isSundayService,
    } = req.body;

    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message: "Aucune église associée à cet utilisateur",
      });
    }

    if (!title?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Le titre de l'événement est obligatoire",
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "La date de l'événement est obligatoire",
      });
    }

    const eventDate = new Date(date);

    if (Number.isNaN(eventDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "La date de l'événement est invalide",
      });
    }

    const event = await Event.create({
      church: req.churchId,
      title: title.trim(),
      type:
        typeof type === "string" && type.trim()
          ? type.trim()
          : "Autre",
      description:
        typeof description === "string"
          ? description.trim()
          : "",
      date: eventDate,
      location:
        typeof location === "string"
          ? location.trim()
          : "",
      leader:
        typeof leader === "string"
          ? leader.trim()
          : "",
      status: status || "À venir",
      isSundayService:
        isSundayService === true ||
        isSundayService === "true",
    });

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "Event",
      entityId: event._id,
      description: `Création de l'événement ${event.title}`,
    });

    return res.status(201).json({
      success: true,
      message: "Événement créé avec succès",
      data: event,
    });
  } catch (error) {
    console.error("Erreur createEvent :", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// LISTE DES ÉVÉNEMENTS
// ======================================================

const getEvents = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message: "Aucune église associée à cet utilisateur",
      });
    }

    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      1000
    );

    const skip = (page - 1) * limit;

    const {
      search,
      type,
      status,
      startDate,
      endDate,
      isSundayService,
    } = req.query;

    const filter = {
      church: req.churchId,
    };

    if (type) {
      filter.type = type;
    }

    if (status) {
      filter.status = status;
    }

    if (typeof isSundayService !== "undefined") {
      filter.isSundayService =
        isSundayService === true ||
        isSundayService === "true";
    }

    if (
      typeof search === "string" &&
      search.trim()
    ) {
      const searchValue = search.trim();

      filter.$or = [
        {
          title: {
            $regex: searchValue,
            $options: "i",
          },
        },
        {
          description: {
            $regex: searchValue,
            $options: "i",
          },
        },
        {
          location: {
            $regex: searchValue,
            $options: "i",
          },
        },
        {
          leader: {
            $regex: searchValue,
            $options: "i",
          },
        },
      ];
    }

    if (startDate || endDate) {
      filter.date = {};

      if (startDate) {
        const start = new Date(startDate);

        if (Number.isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Date de début invalide",
          });
        }

        filter.date.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (Number.isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Date de fin invalide",
          });
        }

        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    const total = await Event.countDocuments(filter);

    const events = await Event.find(filter)
      .sort({ date: 1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: events.length,
      data: events,
    });
  } catch (error) {
    console.error("Erreur getEvents :", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// DÉTAIL D'UN ÉVÉNEMENT
// ======================================================

const getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID événement invalide",
      });
    }

    const event = await Event.findOne({
      _id: id,
      church: req.churchId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Événement introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error("Erreur getEventById :", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// MODIFIER UN ÉVÉNEMENT
// ======================================================

const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID événement invalide",
      });
    }

    const event = await Event.findOne({
      _id: id,
      church: req.churchId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Événement introuvable",
      });
    }

    if (event.attendanceClosed) {
      return res.status(409).json({
        success: false,
        message:
          "Pointages clôturés : rouvre-les avant de modifier cet événement.",
      });
    }

    const {
      title,
      type,
      description,
      date,
      location,
      leader,
      status,
      isSundayService,
    } = req.body;

    if (typeof title !== "undefined") {
      if (
        typeof title !== "string" ||
        !title.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Le titre ne peut pas être vide",
        });
      }

      event.title = title.trim();
    }

    if (typeof type !== "undefined") {
      event.type =
        typeof type === "string"
          ? type.trim()
          : "Autre";
    }

    if (typeof description !== "undefined") {
      event.description =
        typeof description === "string"
          ? description.trim()
          : "";
    }

    if (typeof date !== "undefined") {
      const eventDate = new Date(date);

      if (Number.isNaN(eventDate.getTime())) {
        return res.status(400).json({
          success: false,
          message:
            "La date de l'événement est invalide",
        });
      }

      event.date = eventDate;
    }

    if (typeof location !== "undefined") {
      event.location =
        typeof location === "string"
          ? location.trim()
          : "";
    }

    if (typeof leader !== "undefined") {
      event.leader =
        typeof leader === "string"
          ? leader.trim()
          : "";
    }

    if (typeof status !== "undefined") {
      event.status = status;
    }

    if (typeof isSundayService !== "undefined") {
      event.isSundayService =
        isSundayService === true ||
        isSundayService === "true";
    }

    await event.save();

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Event",
      entityId: event._id,
      description:
        `Modification de l'événement ${event.title}`,
    });

    return res.status(200).json({
      success: true,
      message: "Événement mis à jour avec succès",
      data: event,
    });
  } catch (error) {
    console.error("Erreur updateEvent :", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// SUPPRIMER UN ÉVÉNEMENT
// ======================================================

const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID événement invalide",
      });
    }

    const event = await Event.findOne({
      _id: id,
      church: req.churchId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Événement introuvable",
      });
    }

    if (event.attendanceClosed) {
      return res.status(409).json({
        success: false,
        message:
          "Impossible de supprimer un événement dont les pointages sont clôturés.",
      });
    }

    const eventTitle = event.title;

    await event.deleteOne();

    await createActivityLog({
      req,
      action: "DELETE",
      entity: "Event",
      entityId: id,
      description:
        `Suppression de l'événement ${eventTitle}`,
    });

    return res.status(200).json({
      success: true,
      message: "Événement supprimé avec succès",
    });
  } catch (error) {
    console.error("Erreur deleteEvent :", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// CLÔTURER LES POINTAGES
// ======================================================

const closeEventAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID événement invalide",
      });
    }

    const event = await Event.findOne({
      _id: id,
      church: req.churchId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Événement introuvable",
      });
    }

    if (event.attendanceClosed) {
      return res.status(409).json({
        success: false,
        message: "Pointages déjà clôturés",
      });
    }

    if (
      !["Terminé", "completed"].includes(event.status)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Le culte doit être terminé avant clôture.",
      });
    }

    if (req.body?.confirmComplete !== true) {
      return res.status(400).json({
        success: false,
        message:
          "Confirme la complétude des pointages avec confirmComplete: true.",
      });
    }

    const closed = await Event.findOneAndUpdate(
      {
        _id: id,
        church: req.churchId,
        attendanceClosed: { $ne: true },
        status: {
          $in: ["Terminé", "completed"],
        },
      },
      {
        $set: {
          attendanceClosed: true,
          attendanceClosedAt: new Date(),
          attendanceClosedBy:
            req.user?._id || null,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!closed) {
      return res.status(409).json({
        success: false,
        message:
          "État de l'événement modifié entre-temps.",
      });
    }

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Event",
      entityId: closed._id,
      description:
        `Clôture des pointages : ${closed.title}`,
    });

    return res.status(200).json({
      success: true,
      message: "Pointages clôturés",
      data: closed,
    });
  } catch (error) {
    console.error(
      "Erreur closeEventAttendance :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// RÉOUVRIR LES POINTAGES
// ======================================================

const reopenEventAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID événement invalide",
      });
    }

    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "";

    if (reason.length < 5) {
      return res.status(400).json({
        success: false,
        message:
          "Motif de réouverture requis (5 caractères minimum).",
      });
    }

    const event = await Event.findOneAndUpdate(
      {
        _id: id,
        church: req.churchId,
        attendanceClosed: true,
      },
      {
        $set: {
          attendanceClosed: false,
          attendanceClosedAt: null,
          attendanceClosedBy: null,
        },
        $inc: {
          attendanceRevision: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!event) {
      return res.status(409).json({
        success: false,
        message:
          "Événement introuvable ou pointages non clôturés.",
      });
    }

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Event",
      entityId: event._id,
      description:
        `Réouverture des pointages : ${event.title} — ${reason}`,
    });

    return res.status(200).json({
      success: true,
      message: "Pointages rouverts",
      data: event,
    });
  } catch (error) {
    console.error(
      "Erreur reopenEventAttendance :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  closeEventAttendance,
  reopenEventAttendance,
};
