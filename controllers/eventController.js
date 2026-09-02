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
      isSundayService,
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

    const eventDate = new Date(date);

    if (Number.isNaN(eventDate.getTime())) {
      return res.status(400).json({
        success: false,
        message:
          "La date de l'événement est invalide",
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

      status:
        status || "À venir",

      isSundayService:
        isSundayService === true ||
        isSundayService === "true",
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
      Math.max(
        parseInt(req.query.page, 10) || 1,
        1
      );

    const limit =
      Math.min(
        Math.max(
          parseInt(req.query.limit, 10) || 10,
          1
        ),
        1000
      );

    const skip =
      (page - 1) * limit;

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

    // ==================================================
    // FILTRE CULTE DU DIMANCHE
    // ==================================================

    if (
      typeof isSundayService !==
      "undefined"
    ) {
      filter.isSundayService =
        isSundayService === true ||
        isSundayService === "true";
    }

    // ==================================================
    // RECHERCHE
    // ==================================================

    if (
      typeof search === "string" &&
      search.trim()
    ) {
      const searchValue =
        search.trim();

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

    // ==================================================
    // FILTRE PAR DATE
    // ==================================================

    if (startDate || endDate) {
      filter.date = {};

      if (startDate) {
        const start =
          new Date(startDate);

        if (
          Number.isNaN(
            start.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Date de début invalide",
          });
        }

        filter.date.$gte =
          start;
      }

      if (endDate) {
        const end =
          new Date(endDate);

        if (
          Number.isNaN(
            end.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Date de fin invalide",
          });
        }

        end.setHours(
          23,
          59,
          59,
          999
        );

        filter.date.$lte =
          end;
      }
    }

    const total =
      await Event.countDocuments(
        filter
      );

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
      !mongoose.Types.ObjectId.isValid(
        id
      )
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
    console.error(
      "Erreur getEventById :",
      error
    );

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
      !mongoose.Types.ObjectId.isValid(
        id
      )
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
      isSundayService,
    } = req.body;

    // ==================================================
    // TITRE
    // ==================================================

    if (
      typeof title !==
      "undefined"
    ) {
      if (
        typeof title !==
          "string" ||
        !title.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Le titre ne peut pas être vide",
        });
      }

      event.title =
        title.trim();
    }

    // ==================================================
    // TYPE
    // ==================================================

    if (
      typeof type !==
      "undefined"
    ) {
      event.type =
        typeof type === "string"
          ? type.trim()
          : "Autre";
    }

    // ==================================================
    // DESCRIPTION
    // ==================================================

    if (
      typeof description !==
      "undefined"
    ) {
      event.description =
        typeof description === "string"
          ? description.trim()
          : "";
    }

    // ==================================================
    // DATE
    // ==================================================

    if (
      typeof date !==
      "undefined"
    ) {
      const eventDate =
        new Date(date);

      if (
        Number.isNaN(
          eventDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "La date de l'événement est invalide",
        });
      }

      event.date =
        eventDate;
    }

    // ==================================================
    // LIEU
    // ==================================================

    if (
      typeof location !==
      "undefined"
    ) {
      event.location =
        typeof location === "string"
          ? location.trim()
          : "";
    }

    // ==================================================
    // RESPONSABLE
    // ==================================================

    if (
      typeof leader !==
      "undefined"
    ) {
      event.leader =
        typeof leader === "string"
          ? leader.trim()
          : "";
    }

    // ==================================================
    // STATUT
    // ==================================================

    if (
      typeof status !==
      "undefined"
    ) {
      event.status =
        status;
    }

    // ==================================================
    // CULTE DU DIMANCHE
    // ==================================================

    if (
      typeof isSundayService !==
      "undefined"
    ) {
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
      !mongoose.Types.ObjectId.isValid(
        id
      )
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