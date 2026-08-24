const mongoose = require("mongoose");
const crypto = require("crypto");

const Assignment = require("../models/Assignment");
const Member = require("../models/Member");
const Event = require("../models/Event");
const Department = require("../models/Department");

const createActivityLog = require(
  "../utils/createActivityLog"
);

const sendEmail = require(
  "../utils/sendEmail"
);

const assignmentEmailTemplate = require(
  "../utils/assignmentEmailTemplate"
);

// ======================================================
// HELPER : EMAIL ENVOYÉ
// ======================================================

const markEmailAsSent = async (assignment) => {
  const now = new Date();

  if (!assignment.firstEmailSentAt) {
    assignment.firstEmailSentAt = now;
  }

  assignment.emailSentAt = now;

  assignment.emailSendCount =
    (assignment.emailSendCount || 0) + 1;

  assignment.emailStatus = "sent";

  await assignment.save();
};

// ======================================================
// HELPER : GÉNÉRER / RENOUVELER TOKEN
// ======================================================

const ensureResponseToken = async (assignment) => {
  const now = new Date();

  if (
    !assignment.responseToken ||
    !assignment.responseTokenExpiresAt ||
    assignment.responseTokenExpiresAt <= now
  ) {
    assignment.responseToken = crypto
      .randomBytes(32)
      .toString("hex");

    const expiresAt = new Date();

    expiresAt.setDate(
      expiresAt.getDate() + 30
    );

    assignment.responseTokenExpiresAt =
      expiresAt;

    await assignment.save();
  }
};

// ======================================================
// HELPER : ENVOYER EMAIL PROGRAMMATION
// ======================================================

const sendAssignmentEmail = async ({
  assignment,
  member,
  event,
  department,
  subject,
}) => {
  if (!member?.email) {
    throw new Error(
      "Ce membre ne possède pas d'adresse email"
    );
  }

  await ensureResponseToken(assignment);

  const frontendUrl =
    process.env.FRONTEND_URL ||
    "http://localhost:5173";

  const confirmUrl =
    `${frontendUrl}/assignment-response/${assignment.responseToken}?action=confirm`;

  const declineUrl =
    `${frontendUrl}/assignment-response/${assignment.responseToken}?action=decline`;

  const html = assignmentEmailTemplate({
    member,
    event,
    department,
    assignment,
    confirmUrl,
    declineUrl,
  });

  await sendEmail({
    to: member.email,
    subject,
    html,
  });

  await markEmailAsSent(
    assignment
  );
};

// ======================================================
// CRÉER UNE PROGRAMMATION
// ======================================================

const createAssignment = async (req, res) => {
  try {
    const {
      member,
      event,
      department,
      role,
      note,
    } = req.body;

    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    if (!member || !event || !role?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Membre, événement et rôle sont requis",
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

    if (
      department &&
      !mongoose.Types.ObjectId.isValid(department)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID département invalide",
      });
    }

    // Le membre doit appartenir à la même église.
    const memberExists =
      await Member.findOne({
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

    // L'événement doit appartenir à la même église.
    const eventExists =
      await Event.findOne({
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

    // Le département doit appartenir à la même église.
    let departmentExists = null;

    if (department) {
      departmentExists =
        await Department.findOne({
          _id: department,
          church: req.churchId,
        });

      if (!departmentExists) {
        return res.status(404).json({
          success: false,
          message:
            "Département introuvable dans cette église",
        });
      }
    }

    const existingAssignment =
      await Assignment.findOne({
        church: req.churchId,
        member,
        event,
        role: role.trim(),
      });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message:
          "Ce membre est déjà programmé pour ce rôle sur cet événement",
      });
    }

    const responseToken = crypto
      .randomBytes(32)
      .toString("hex");

    const responseTokenExpiresAt =
      new Date();

    responseTokenExpiresAt.setDate(
      responseTokenExpiresAt.getDate() + 30
    );

    const assignment =
      await Assignment.create({
        church: req.churchId,

        member,
        event,

        department:
          department || null,

        role:
          role.trim(),

        note:
          note?.trim() || "",

        status:
          "pending",

        createdBy:
          req.user?._id || null,

        responseToken,
        responseTokenExpiresAt,

        emailStatus:
          "not_sent",

        emailSendCount: 0,
        reminderCount: 0,
      });

    // ==================================================
    // EMAIL AUTOMATIQUE
    // ==================================================

    if (memberExists.email) {
      try {
        await sendAssignmentEmail({
          assignment,

          member:
            memberExists,

          event:
            eventExists,

          department:
            departmentExists,

          subject:
            `Votre programmation - ${eventExists.title}`,
        });
      } catch (emailError) {
        console.error(
          "Erreur email programmation :",
          emailError.message
        );

        assignment.emailStatus =
          "failed";

        await assignment.save();
      }
    }

    const populatedAssignment =
      await Assignment.findOne({
        _id: assignment._id,
        church: req.churchId,
      })
        .populate(
          "member",
          "firstName lastName email phone status"
        )
        .populate(
          "event",
          "title date type location status"
        )
        .populate(
          "department",
          "name leader status"
        )
        .populate(
          "createdBy",
          "name email role"
        );

    await createActivityLog({
      req,
      action: "CREATE",
      entity: "Assignment",
      entityId:
        assignment._id,

      description:
        `Programmation de ${
          memberExists.firstName || ""
        } ${
          memberExists.lastName || ""
        } pour ${
          eventExists.title || ""
        } - rôle : ${role.trim()}`,
    });

    return res.status(201).json({
      success: true,
      message:
        "Programmation créée avec succès",
      data:
        populatedAssignment,
    });
  } catch (error) {
    console.error(
      "Erreur createAssignment :",
      error
    );

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "Cette programmation existe déjà",
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
// LISTE DES PROGRAMMATIONS
// ======================================================

const getAssignments = async (req, res) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const {
      event,
      member,
      department,
      status,
      search,
    } = req.query;

    const page =
      parseInt(
        req.query.page,
        10
      ) || 1;

    const limit =
      parseInt(
        req.query.limit,
        10
      ) || 10;

    const skip =
      (page - 1) * limit;

    const filter = {
      church: req.churchId,
    };

    if (event) {
      filter.event = event;
    }

    if (member) {
      filter.member = member;
    }

    if (department) {
      filter.department =
        department;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.role = {
        $regex: search,
        $options: "i",
      };
    }

    const total =
      await Assignment.countDocuments(
        filter
      );

    const assignments =
      await Assignment.find(filter)
        .populate(
          "member",
          "firstName lastName email phone status"
        )
        .populate(
          "event",
          "title date type location status"
        )
        .populate(
          "department",
          "name leader status"
        )
        .populate(
          "createdBy",
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
        Math.ceil(
          total / limit
        ),

      count:
        assignments.length,

      data:
        assignments,
    });
  } catch (error) {
    console.error(
      "Erreur getAssignments :",
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
// DÉTAIL
// ======================================================

const getAssignmentById = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID programmation invalide",
      });
    }

    const assignment =
      await Assignment.findOne({
        _id: id,
        church: req.churchId,
      })
        .populate(
          "member"
        )
        .populate(
          "event"
        )
        .populate(
          "department"
        )
        .populate(
          "createdBy",
          "name email role"
        );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message:
          "Programmation introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      data:
        assignment,
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
// MODIFIER
// ======================================================

const updateAssignment = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID programmation invalide",
      });
    }

    const assignment =
      await Assignment.findOne({
        _id: id,
        church: req.churchId,
      });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message:
          "Programmation introuvable",
      });
    }

    const {
      member,
      event,
      department,
      role,
      note,
      status,
    } = req.body;

    // ==============================
    // MEMBRE
    // ==============================

    if (
      typeof member !== "undefined"
    ) {
      if (
        !mongoose.Types.ObjectId.isValid(
          member
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "ID membre invalide",
        });
      }

      const memberExists =
        await Member.findOne({
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

      assignment.member =
        member;
    }

    // ==============================
    // ÉVÉNEMENT
    // ==============================

    if (
      typeof event !== "undefined"
    ) {
      if (
        !mongoose.Types.ObjectId.isValid(
          event
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "ID événement invalide",
        });
      }

      const eventExists =
        await Event.findOne({
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

      assignment.event =
        event;
    }

    // ==============================
    // DÉPARTEMENT
    // ==============================

    if (
      typeof department !==
      "undefined"
    ) {
      if (department) {
        if (
          !mongoose.Types.ObjectId.isValid(
            department
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "ID département invalide",
          });
        }

        const departmentExists =
          await Department.findOne({
            _id:
              department,

            church:
              req.churchId,
          });

        if (!departmentExists) {
          return res.status(404).json({
            success: false,
            message:
              "Département introuvable dans cette église",
          });
        }

        assignment.department =
          department;
      } else {
        assignment.department =
          null;
      }
    }

    if (
      typeof role !==
      "undefined"
    ) {
      if (!role.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Le rôle ne peut pas être vide",
        });
      }

      assignment.role =
        role.trim();
    }

    if (
      typeof note !==
      "undefined"
    ) {
      assignment.note =
        note.trim();
    }

    if (
      typeof status !==
      "undefined"
    ) {
      assignment.status =
        status;
    }

    if (
      assignment.status ===
      "confirmed"
    ) {
      assignment.confirmedAt =
        assignment.confirmedAt ||
        new Date();

      assignment.declinedAt =
        null;
    }

    if (
      assignment.status ===
      "declined"
    ) {
      assignment.declinedAt =
        assignment.declinedAt ||
        new Date();

      assignment.confirmedAt =
        null;
    }

    if (
      assignment.status ===
      "pending"
    ) {
      assignment.confirmedAt =
        null;

      assignment.declinedAt =
        null;
    }

    await assignment.save();

    const populatedAssignment =
      await Assignment.findOne({
        _id: assignment._id,
        church: req.churchId,
      })
        .populate(
          "member",
          "firstName lastName email phone"
        )
        .populate(
          "event",
          "title date type location status"
        )
        .populate(
          "department",
          "name"
        )
        .populate(
          "createdBy",
          "name email role"
        );

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Assignment",
      entityId:
        assignment._id,

      description:
        `Modification de la programmation - rôle : ${
          assignment.role || ""
        }`,
    });

    return res.status(200).json({
      success: true,
      message:
        "Programmation mise à jour avec succès",
      data:
        populatedAssignment,
    });
  } catch (error) {
    console.error(
      "Erreur updateAssignment :",
      error
    );

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "Cette programmation existe déjà",
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
// SUPPRIMER
// ======================================================

const deleteAssignment = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID programmation invalide",
      });
    }

    const assignment =
      await Assignment.findOne({
        _id: id,
        church: req.churchId,
      })
        .populate(
          "member",
          "firstName lastName"
        )
        .populate(
          "event",
          "title"
        );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message:
          "Programmation introuvable",
      });
    }

    const description =
      `Suppression de la programmation de ${
        assignment.member?.firstName ||
        ""
      } ${
        assignment.member?.lastName ||
        ""
      } pour ${
        assignment.event?.title ||
        ""
      }`.trim();

    await assignment.deleteOne();

    await createActivityLog({
      req,
      action: "DELETE",
      entity: "Assignment",
      entityId: id,
      description,
    });

    return res.status(200).json({
      success: true,
      message:
        "Programmation supprimée avec succès",
    });
  } catch (error) {
    console.error(
      "Erreur deleteAssignment :",
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
// CONFIRMER CÔTÉ ADMIN
// ======================================================

const confirmAssignment = async (
  req,
  res
) => {
  try {
    const assignment =
      await Assignment.findOne({
        _id: req.params.id,
        church: req.churchId,
      });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message:
          "Programmation introuvable",
      });
    }

    assignment.status =
      "confirmed";

    assignment.confirmedAt =
      new Date();

    assignment.declinedAt =
      null;

    await assignment.save();

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Assignment",
      entityId:
        assignment._id,

      description:
        "Programmation confirmée manuellement",
    });

    return res.status(200).json({
      success: true,
      message:
        "Participation confirmée",
      data:
        assignment,
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
// REFUSER CÔTÉ ADMIN
// ======================================================

const declineAssignment = async (
  req,
  res
) => {
  try {
    const assignment =
      await Assignment.findOne({
        _id: req.params.id,
        church: req.churchId,
      });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message:
          "Programmation introuvable",
      });
    }

    assignment.status =
      "declined";

    assignment.declinedAt =
      new Date();

    assignment.confirmedAt =
      null;

    await assignment.save();

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Assignment",
      entityId:
        assignment._id,

      description:
        "Programmation refusée manuellement",
    });

    return res.status(200).json({
      success: true,
      message:
        "Participation refusée",
      data:
        assignment,
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
// STATISTIQUES
// ======================================================

const getAssignmentStats = async (
  req,
  res
) => {
  try {
    const churchFilter = {
      church: req.churchId,
    };

    const [
      total,
      pending,
      confirmed,
      declined,
      cancelled,
    ] = await Promise.all([
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

      Assignment.countDocuments({
        ...churchFilter,
        status: "cancelled",
      }),
    ]);

    const confirmationRate =
      total > 0
        ? Number(
            (
              (confirmed / total) *
              100
            ).toFixed(2)
          )
        : 0;

    return res.status(200).json({
      success: true,

      data: {
        total,
        pending,
        confirmed,
        declined,
        cancelled,
        confirmationRate,
      },
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
// PROGRAMMATION PUBLIQUE
// ======================================================
// Pas besoin de connexion.
// Le token aléatoire identifie la programmation.
// ======================================================

const getPublicAssignment = async (
  req,
  res
) => {
  try {
    const { token } =
      req.params;

    const assignment =
      await Assignment.findOne({
        responseToken: token,

        responseTokenExpiresAt: {
          $gt: new Date(),
        },
      })
        .populate(
          "member",
          "firstName lastName"
        )
        .populate(
          "event",
          "title date location type status"
        )
        .populate(
          "department",
          "name"
        )
        .populate(
          "church",
          "name slug"
        );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message:
          "Lien invalide ou expiré",
      });
    }

    return res.status(200).json({
      success: true,

      data: {
        member:
          assignment.member,

        event:
          assignment.event,

        department:
          assignment.department,

        church:
          assignment.church,

        role:
          assignment.role,

        note:
          assignment.note,

        status:
          assignment.status,

        confirmedAt:
          assignment.confirmedAt,

        declinedAt:
          assignment.declinedAt,
      },
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
// RÉPONSE PUBLIQUE
// ======================================================

const respondToAssignment = async (
  req,
  res
) => {
  try {
    const { token } =
      req.params;

    const { action } =
      req.body;

    if (
      ![
        "confirm",
        "decline",
      ].includes(action)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Réponse invalide",
      });
    }

    const assignment =
      await Assignment.findOne({
        responseToken: token,

        responseTokenExpiresAt: {
          $gt: new Date(),
        },
      });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message:
          "Lien invalide ou expiré",
      });
    }

    if (
      assignment.status ===
      "cancelled"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Cette programmation a été annulée",
      });
    }

    if (action === "confirm") {
      assignment.status =
        "confirmed";

      assignment.confirmedAt =
        new Date();

      assignment.declinedAt =
        null;
    }

    if (action === "decline") {
      assignment.status =
        "declined";

      assignment.declinedAt =
        new Date();

      assignment.confirmedAt =
        null;
    }

    await assignment.save();

    return res.status(200).json({
      success: true,

      message:
        action === "confirm"
          ? "Votre participation est confirmée"
          : "Votre indisponibilité a été enregistrée",

      data: {
        status:
          assignment.status,

        confirmedAt:
          assignment.confirmedAt,

        declinedAt:
          assignment.declinedAt,
      },
    });
  } catch (error) {
    console.error(
      "Erreur respondToAssignment :",
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
// RENVOYER EMAIL
// ======================================================

const resendAssignmentEmail = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "ID programmation invalide",
      });
    }

    const assignment =
      await Assignment.findOne({
        _id: id,
        church: req.churchId,
      })
        .populate(
          "member"
        )
        .populate(
          "event"
        )
        .populate(
          "department"
        );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message:
          "Programmation introuvable",
      });
    }

    if (
      !assignment.member?.email
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Ce membre ne possède pas d'adresse email",
      });
    }

    try {
      await sendAssignmentEmail({
        assignment,

        member:
          assignment.member,

        event:
          assignment.event,

        department:
          assignment.department,

        subject:
          `Rappel de programmation - ${
            assignment.event
              ?.title ||
            "Événement"
          }`,
      });
    } catch (emailError) {
      console.error(
        "Erreur renvoi email :",
        emailError.message
      );

      assignment.emailStatus =
        "failed";

      await assignment.save();

      return res.status(500).json({
        success: false,
        message:
          "L'email n'a pas pu être envoyé",
      });
    }

    await createActivityLog({
      req,
      action: "UPDATE",
      entity: "Assignment",
      entityId:
        assignment._id,

      description:
        `Email de programmation renvoyé à ${
          assignment.member
            ?.firstName ||
          ""
        } ${
          assignment.member
            ?.lastName ||
          ""
        }`.trim(),
    });

    return res.status(200).json({
      success: true,
      message:
        "Email renvoyé avec succès",
      data:
        assignment,
    });
  } catch (error) {
    console.error(
      "Erreur resendAssignmentEmail :",
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
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,

  confirmAssignment,
  declineAssignment,

  getAssignmentStats,

  getPublicAssignment,
  respondToAssignment,

  resendAssignmentEmail,
};