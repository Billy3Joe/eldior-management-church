const mongoose = require("mongoose");

const Event = require("../models/Event");

const createActivityLog = require(
  "../utils/createActivityLog"
);

// ======================================================
// CRÉER
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
    } = req.body;

    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    if (!title?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Le titre de l'événement est obligatoire",
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message:
          "La date de l'événement est obligatoire",
      });
    }

    const event = await Event.create({
      church: req.churchId,
      title: title.trim(),
      type: type || "Autre",
      description:
        description?.trim() || "",
      date,
      location:
        location?.trim() || "",
      leader:
        leader?.trim() || "",
      status:
        status || "À venir",
    });

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "Event",
      entityId: event._id,
      description:
        `Création de l'événement ${event.title}`,
    });

    return res.status(201).json({
      success: true,
      message:
        "Événement créé avec succès",
      data: event,
    });
  } catch (error) {
    console.error(
      "Erreur createEvent :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// LISTE
// ======================================================

const getEvents = async (req, res) => {
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
      search,
      type,
      status,
      startDate,
      endDate,
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

    if (search) {
      filter.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          description: {
            $regex: search,
            $options: "i",
          },
        },
        {
          location: {
            $regex: search,
            $options: "i",
          },
        },
        {
          leader: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    if (startDate || endDate) {
      filter.date = {};

      if (startDate) {
        filter.date.$gte =
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

        filter.date.$lte = end;
      }
    }

    const total =
      await Event.countDocuments(filter);

    const events =
      await Event.find(filter)
        .sort({
          date: 1,
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
        events.length,
      data:
        events,
    });
  } catch (error) {
    console.error(
      "Erreur getEvents :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// DÉTAIL
// ======================================================

const getEventById = async (
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
          "ID événement invalide",
      });
    }

    const event =
      await Event.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!event) {
      return res.status(404).json({
        success: false,
        message:
          "Événement introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      data: event,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// MODIFIER
// ======================================================

const updateEvent = async (
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
          "ID événement invalide",
      });
    }

    const event =
      await Event.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!event) {
      return res.status(404).json({
        success: false,
        message:
          "Événement introuvable",
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
    } = req.body;

    if (
      typeof title !==
      "undefined"
    ) {
      if (!title.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Le titre ne peut pas être vide",
        });
      }

      event.title =
        title.trim();
    }

    if (
      typeof type !==
      "undefined"
    ) {
      event.type = type;
    }

    if (
      typeof description !==
      "undefined"
    ) {
      event.description =
        description.trim();
    }

    if (
      typeof date !==
      "undefined"
    ) {
      event.date = date;
    }

    if (
      typeof location !==
      "undefined"
    ) {
      event.location =
        location.trim();
    }

    if (
      typeof leader !==
      "undefined"
    ) {
      event.leader =
        leader.trim();
    }

    if (
      typeof status !==
      "undefined"
    ) {
      event.status = status;
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
      message:
        "Événement mis à jour avec succès",
      data: event,
    });
  } catch (error) {
    console.error(
      "Erreur updateEvent :",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// SUPPRIMER
// ======================================================

const deleteEvent = async (
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
          "ID événement invalide",
      });
    }

    const event =
      await Event.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!event) {
      return res.status(404).json({
        success: false,
        message:
          "Événement introuvable",
      });
    }

    const eventTitle =
      event.title;

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
      message:
        "Événement supprimé avec succès",
    });
  } catch (error) {
    console.error(
      "Erreur deleteEvent :",
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
};