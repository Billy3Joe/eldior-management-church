const mongoose = require("mongoose");

const Attendance = require("../models/Attendance");
const Member = require("../models/Member");
const Event = require("../models/Event");

const createActivityLog = require(
  "../utils/createActivityLog"
);

// ======================================================
// CONSTANTES
// ======================================================

const ATTENDANCE_STATUSES = [
  "Présent",
  "Absent",
  "Excusé",
  "En retard",
];

const ATTENDED_STATUSES = [
  "Présent",
  "En retard",
];

const AGE_GROUPS = [
  "0-3",
  "4-6",
  "7-10",
  "11-14",
  "15-17",
  "18+",
  "Non renseigné",
];

// ======================================================
// HELPERS
// ======================================================

const calculateAge = (
  birthDate,
  referenceDate
) => {
  if (!birthDate || !referenceDate) {
    return null;
  }

  const birth = new Date(birthDate);
  const reference = new Date(referenceDate);

  if (
    Number.isNaN(birth.getTime()) ||
    Number.isNaN(reference.getTime())
  ) {
    return null;
  }

  let age =
    reference.getFullYear() -
    birth.getFullYear();

  const monthDifference =
    reference.getMonth() -
    birth.getMonth();

  if (
    monthDifference < 0 ||
    (
      monthDifference === 0 &&
      reference.getDate() <
        birth.getDate()
    )
  ) {
    age -= 1;
  }

  if (age < 0) {
    return null;
  }

  return age;
};

const getAgeGroup = (
  age,
  fallback = "Non renseigné"
) => {
  if (
    age === null ||
    typeof age === "undefined"
  ) {
    return AGE_GROUPS.includes(fallback)
      ? fallback
      : "Non renseigné";
  }

  if (age <= 3) {
    return "0-3";
  }

  if (age <= 6) {
    return "4-6";
  }

  if (age <= 10) {
    return "7-10";
  }

  if (age <= 14) {
    return "11-14";
  }

  if (age <= 17) {
    return "15-17";
  }

  return "18+";
};

const buildDemographicSnapshot = (
  member,
  event
) => {
  const ageAtEvent = calculateAge(
    member?.birthDate,
    event?.date
  );

  return {
    genderSnapshot:
      member?.gender || "",

    ageAtEvent,

    ageGroupSnapshot:
      getAgeGroup(
        ageAtEvent,
        member?.ageGroup ||
          "Non renseigné"
      ),

    membershipTypeSnapshot:
      member?.membershipType ||
      "Membre",
  };
};

const safeCreateActivityLog =
  async (payload) => {
    try {
      await createActivityLog(payload);
    } catch (error) {
      console.error(
        "Erreur ActivityLog non bloquante :",
        error.message
      );
    }
  };

// ======================================================
// RECALCUL HISTORIQUE VISITE
// ======================================================

// ======================================================
// RECALCUL HISTORIQUE VISITE
// ======================================================

const recalculateMemberVisitHistory =
  async (
    churchId,
    memberId
  ) => {
    try {
      if (
        !churchId ||
        !memberId
      ) {
        return;
      }

      // --------------------------------------------------
      // Récupérer le membre
      // --------------------------------------------------

      const member =
        await Member.findOne({
          _id: memberId,
          church: churchId,
        }).select(
          "membershipType wasVisitor"
        );

      if (!member) {
        return;
      }

      // --------------------------------------------------
      // Récupérer toutes les présences réelles
      // --------------------------------------------------

      const attendances =
        await Attendance.find({
          church: churchId,
          member: memberId,
          status: {
            $in:
              ATTENDED_STATUSES,
          },
        })
          .select(
            [
              "_id",
              "event",
              "isFirstVisit",
              "membershipTypeSnapshot",
            ].join(" ")
          )
          .populate(
            "event",
            "date"
          );

      const validAttendances =
        attendances
          .filter(
            (attendance) =>
              attendance.event
                ?.date
          )
          .sort(
            (a, b) =>
              new Date(
                a.event.date
              ) -
              new Date(
                b.event.date
              )
          );

      // --------------------------------------------------
      // Toujours nettoyer les anciens isFirstVisit
      // --------------------------------------------------

      await Attendance.updateMany(
        {
          church: churchId,
          member: memberId,
        },
        {
          $set: {
            isFirstVisit:
              false,
          },
        }
      );

      // --------------------------------------------------
      // Aucune présence réelle
      // --------------------------------------------------

      if (
        validAttendances.length ===
        0
      ) {
        await Member.updateOne(
          {
            _id: memberId,
            church: churchId,
          },
          {
            $set: {
              firstVisitDate:
                null,

              lastVisitDate:
                null,

              visitCount: 0,
            },
          }
        );

        return;
      }

      const firstAttendance =
        validAttendances[0];

      const lastAttendance =
        validAttendances[
          validAttendances.length -
            1
        ];

      // --------------------------------------------------
      // Déterminer si cette personne vient
      // réellement d'un parcours visiteur
      // --------------------------------------------------

      const hasVisitorAttendance =
        validAttendances.some(
          (attendance) =>
            attendance
              .membershipTypeSnapshot ===
            "Visiteur"
        );

      const isVisitorJourney =
        member.membershipType ===
          "Visiteur" ||
        member.wasVisitor === true ||
        hasVisitorAttendance;

      // --------------------------------------------------
      // Seulement un visiteur peut avoir
      // une "première visite"
      // --------------------------------------------------

      if (isVisitorJourney) {
        await Attendance.updateOne(
          {
            _id:
              firstAttendance._id,

            church:
              churchId,
          },
          {
            $set: {
              isFirstVisit:
                true,
            },
          }
        );
      }

      // --------------------------------------------------
      // Historique membre
      // --------------------------------------------------

      await Member.updateOne(
        {
          _id:
            memberId,

          church:
            churchId,
        },
        {
          $set: {
            firstVisitDate:
              isVisitorJourney
                ? firstAttendance
                    .event.date
                : null,

            lastVisitDate:
              lastAttendance
                .event.date,

            visitCount:
              validAttendances.length,
          },
        }
      );
    } catch (error) {
      console.error(
        "Erreur recalcul historique visite :",
        error.message
      );
    }
  };

// ======================================================
// POPULATE
// ======================================================

const getPopulatedAttendance =
  async (
    attendanceId,
    churchId
  ) => {
    return Attendance.findOne({
      _id: attendanceId,
      church: churchId,
    })
      .populate(
        "member",
        [
          "firstName",
          "lastName",
          "email",
          "phone",
          "gender",
          "birthDate",
          "ageGroup",
          "membershipType",
          "firstVisitDate",
          "lastVisitDate",
          "visitCount",
          "followUpStatus",
          "department",
        ].join(" ")
      )
      .populate(
        "event",
        "title date location type status isSundayService"
      )
      .populate(
        "markedBy",
        "name email role"
      );
  };

// ======================================================
// STATISTIQUES D'UN ÉVÉNEMENT
// ======================================================

const buildEventStatistics =
  async (
    churchId,
    event
  ) => {
    // ==================================================
    // TOUTES LES PRÉSENCES MARQUÉES POUR L'ÉVÉNEMENT
    // ==================================================

    const attendances =
      await Attendance.find({
        church: churchId,
        event: event._id,
      }).populate(
        "member",
        [
          "firstName",
          "lastName",
          "gender",
          "birthDate",
          "ageGroup",
          "membershipType",
          "wasVisitor",
        ].join(" ")
      );

    // ==================================================
    // PERSONNES PHYSIQUEMENT PRÉSENTES
    //
    // Présent + En retard
    // ==================================================

    const presentRows =
      attendances.filter(
        (attendance) =>
          ATTENDED_STATUSES.includes(
            attendance.status
          )
      );

    // ==================================================
    // CLASSES D'ÂGE
    // ==================================================

    const ageGroups = {
      "0-3": 0,
      "4-6": 0,
      "7-10": 0,
      "11-14": 0,
      "15-17": 0,
      "18+": 0,
      "Non renseigné": 0,
    };

    // ==================================================
    // COMPTEURS DÉMOGRAPHIQUES
    // ==================================================

    let men = 0;
    let women = 0;

    let members = 0;
    let visitors = 0;

    let newPeople = 0;
    let newMen = 0;
    let newWomen = 0;

    // ==================================================
    // ANALYSE DES PERSONNES PRÉSENTES
    // ==================================================

    presentRows.forEach(
      (attendance) => {
        const member =
          attendance.member;

        // ----------------------------------------------
        // SEXE
        // ----------------------------------------------

        const gender =
          member?.gender ||
          attendance.genderSnapshot ||
          "";

        if (
          gender === "Homme"
        ) {
          men += 1;
        }

        if (
          gender === "Femme"
        ) {
          women += 1;
        }

        // ----------------------------------------------
        // ÂGE AU JOUR DU CULTE
        // ----------------------------------------------

        const calculatedAge =
          calculateAge(
            member?.birthDate,
            event.date
          );

        let ageGroup =
          "Non renseigné";

        // Date de naissance prioritaire
        if (
          calculatedAge !==
          null
        ) {
          ageGroup =
            getAgeGroup(
              calculatedAge,
              "Non renseigné"
            );
        }

        // Puis tranche enregistrée dans Member
        else if (
          member?.ageGroup &&
          AGE_GROUPS.includes(
            member.ageGroup
          )
        ) {
          ageGroup =
            member.ageGroup;
        }

        // Puis snapshot historique
        else if (
          attendance
            .ageGroupSnapshot &&
          AGE_GROUPS.includes(
            attendance
              .ageGroupSnapshot
          )
        ) {
          ageGroup =
            attendance
              .ageGroupSnapshot;
        }

        if (
          !Object.prototype
            .hasOwnProperty.call(
              ageGroups,
              ageGroup
            )
        ) {
          ageGroup =
            "Non renseigné";
        }

        ageGroups[
          ageGroup
        ] += 1;

        // ----------------------------------------------
        // MEMBRE / VISITEUR
        //
        // On privilégie la situation enregistrée
        // au moment du culte.
        // ----------------------------------------------

        const membershipType =
          attendance
            .membershipTypeSnapshot ||
          member?.membershipType ||
          "Membre";

        if (
          membershipType ===
          "Visiteur"
        ) {
          visitors += 1;
        } else {
          members += 1;
        }

        // ----------------------------------------------
        // NOUVELLE PERSONNE
        // ----------------------------------------------

        const isRealNewPerson =
        attendance.isFirstVisit ===
          true &&
        (
          attendance
            .membershipTypeSnapshot ===
            "Visiteur" ||
          member?.wasVisitor ===
            true
        );
      
      if (isRealNewPerson) {
        newPeople += 1;
      
        if (
          gender === "Homme"
        ) {
          newMen += 1;
        }
      
        if (
          gender === "Femme"
        ) {
          newWomen += 1;
        }
      }
      }
    );

    // ==================================================
    // STATUTS DE PRÉSENCE
    // ==================================================

    const present =
      attendances.filter(
        (attendance) =>
          attendance.status ===
          "Présent"
      ).length;

    const late =
      attendances.filter(
        (attendance) =>
          attendance.status ===
          "En retard"
      ).length;

    const absent =
      attendances.filter(
        (attendance) =>
          attendance.status ===
          "Absent"
      ).length;

    const excused =
      attendances.filter(
        (attendance) =>
          attendance.status ===
          "Excusé"
      ).length;

    // ==================================================
    // TOTAL RÉELLEMENT PRÉSENT
    // ==================================================

    const totalAttendance =
      present + late;

    // ==================================================
    // CATÉGORIES D'ÂGE
    // ==================================================

    const children =
      ageGroups["0-3"] +
      ageGroups["4-6"] +
      ageGroups["7-10"] +
      ageGroups["11-14"];

    const teenagers =
      ageGroups["15-17"];

    const adults =
      ageGroups["18+"];

    // ==================================================
    // TAUX DE PRÉSENCE
    // ==================================================

    const totalMarked =
      attendances.length;

    const attendanceRate =
      totalMarked > 0
        ? Number(
            (
              (
                totalAttendance /
                totalMarked
              ) *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // RÉPONSE
    // ==================================================

    return {
      event: {
        _id:
          event._id,

        title:
          event.title,

        date:
          event.date,

        type:
          event.type,

        location:
          event.location,

        status:
          event.status,

        isSundayService:
          event.isSundayService ===
          true,
      },

      totalMarked,

      totalAttendance,

      present,

      late,

      absent,

      excused,

      attendanceRate,

      demographics: {
        men,

        women,

        adults,

        children,

        teenagers,

        ageGroups,
      },

      people: {
        members,

        visitors,

        newPeople,

        newMen,

        newWomen,
      },
    };
  };

// ======================================================
// MARQUER / CRÉER / METTRE À JOUR UNE PRÉSENCE
// ======================================================

const markAttendance =
  async (
    req,
    res
  ) => {
    try {
      const {
        member,
        event,
        status = "Présent",
        note = "",
      } = req.body;

      if (!req.churchId) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Aucune église associée à cet utilisateur",
          });
      }

      if (
        !member ||
        !event
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Le membre et l'événement sont obligatoires",
          });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          member
        ) ||
        !mongoose.Types.ObjectId.isValid(
          event
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "ID membre ou événement invalide",
          });
      }

      if (
        !ATTENDANCE_STATUSES.includes(
          status
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Statut de présence invalide",
          });
      }

      const [
        memberExists,
        eventExists,
      ] =
        await Promise.all([
          Member.findOne({
            _id: member,
            church:
              req.churchId,
          }),

          Event.findOne({
            _id: event,
            church:
              req.churchId,
          }),
        ]);

      if (!memberExists) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Membre introuvable dans cette église",
          });
      }

      if (!eventExists) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Événement introuvable dans cette église",
          });
      }

      const demographicSnapshot =
        buildDemographicSnapshot(
          memberExists,
          eventExists
        );

      const attendance =
        await Attendance.findOneAndUpdate(
          {
            church:
              req.churchId,

            member,

            event,
          },

          {
            $set: {
              status,

              note:
                typeof note ===
                "string"
                  ? note.trim()
                  : "",

              ...demographicSnapshot,

              markedBy:
                req.user?._id ||
                null,

              markedAt:
                new Date(),
            },

            $setOnInsert: {
              church:
                req.churchId,

              member,

              event,
            },
          },

          {
            new: true,
            upsert: true,
            runValidators: true,
          }
        );

      await recalculateMemberVisitHistory(
        req.churchId,
        member
      );

      const populatedAttendance =
        await getPopulatedAttendance(
          attendance._id,
          req.churchId
        );

      await safeCreateActivityLog({
        req,

        action:
          "CREATE",

        entity:
          "Attendance",

        entityId:
          attendance._id,

        description:
          `Présence enregistrée pour ${memberExists.firstName} ${memberExists.lastName} - ${eventExists.title} - ${status}`,
      });

      return res
        .status(200)
        .json({
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

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message ||
            "Erreur lors de l'enregistrement de la présence",
        });
    }
  };

// ======================================================
// TOUTES LES PRÉSENCES
// ======================================================

const getAttendances =
  async (
    req,
    res
  ) => {
    try {
      const page =
        Math.max(
          parseInt(
            req.query.page,
            10
          ) || 1,
          1
        );

      const limit =
        Math.min(
          Math.max(
            parseInt(
              req.query.limit,
              10
            ) || 10,
            1
          ),
          1000
        );

      const skip =
        (page - 1) *
        limit;

      const filter = {
        church:
          req.churchId,
      };

      if (
        req.query.member
      ) {
        filter.member =
          req.query.member;
      }

      if (
        req.query.event
      ) {
        filter.event =
          req.query.event;
      }

      if (
        req.query.status
      ) {
        filter.status =
          req.query.status;
      }

      const [
        total,
        attendances,
      ] =
        await Promise.all([
          Attendance.countDocuments(
            filter
          ),

          Attendance.find(
            filter
          )
            .populate(
              "member",
              "firstName lastName email phone gender birthDate ageGroup membershipType firstVisitDate lastVisitDate visitCount followUpStatus"
            )
            .populate(
              "event",
              "title date location type status isSundayService"
            )
            .populate(
              "markedBy",
              "name email role"
            )
            .sort({
              createdAt: -1,
            })
            .skip(skip)
            .limit(limit),
        ]);

      return res.json({
        success: true,

        page,
        limit,
        total,

        totalPages:
          Math.ceil(
            total / limit
          ),

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

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message,
        });
    }
  };

// ======================================================
// PRÉSENCES PAR ÉVÉNEMENT
// ======================================================

const getAttendancesByEvent =
  async (
    req,
    res
  ) => {
    try {
      const {
        eventId,
      } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          eventId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "ID événement invalide",
          });
      }

      const event =
        await Event.findOne({
          _id:
            eventId,

          church:
            req.churchId,
        });

      if (!event) {
        return res
          .status(404)
          .json({
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
            eventId,
        })
          .populate(
            "member",
            "firstName lastName email phone gender birthDate ageGroup department membershipType firstVisitDate lastVisitDate visitCount followUpStatus"
          )
          .populate(
            "markedBy",
            "name email role"
          )
          .sort({
            createdAt: -1,
          });

      return res.json({
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

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message,
        });
    }
  };

// ======================================================
// UNE PRÉSENCE
// ======================================================

const getAttendanceById =
  async (
    req,
    res
  ) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "ID présence invalide",
          });
      }

      const attendance =
        await getPopulatedAttendance(
          id,
          req.churchId
        );

      if (!attendance) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Présence introuvable",
          });
      }

      return res.json({
        success: true,

        data:
          attendance,
      });
    } catch (error) {
      console.error(
        "Erreur getAttendanceById :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message,
        });
    }
  };

// ======================================================
// MODIFIER UNE PRÉSENCE
// ======================================================

const updateAttendance =
  async (
    req,
    res
  ) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "ID présence invalide",
          });
      }

      const attendance =
        await Attendance.findOne({
          _id: id,

          church:
            req.churchId,
        });

      if (!attendance) {
        return res
          .status(404)
          .json({
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
        typeof status !==
          "undefined" &&
        !ATTENDANCE_STATUSES.includes(
          status
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Statut invalide",
          });
      }

      if (
        typeof status !==
        "undefined"
      ) {
        attendance.status =
          status;
      }

      if (
        typeof note !==
        "undefined"
      ) {
        attendance.note =
          typeof note ===
          "string"
            ? note.trim()
            : "";
      }

      attendance.markedBy =
        req.user?._id ||
        attendance.markedBy;

      attendance.markedAt =
        new Date();

      await attendance.save();

      await recalculateMemberVisitHistory(
        req.churchId,
        attendance.member
      );

      const updated =
        await getPopulatedAttendance(
          attendance._id,
          req.churchId
        );

      await safeCreateActivityLog({
        req,

        action:
          "UPDATE",

        entity:
          "Attendance",

        entityId:
          attendance._id,

        description:
          `Modification présence : ${attendance.status}`,
      });

      return res.json({
        success: true,

        message:
          "Présence mise à jour avec succès",

        data:
          updated,
      });
    } catch (error) {
      console.error(
        "Erreur updateAttendance :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message,
        });
    }
  };

// ======================================================
// SUPPRIMER
// ======================================================

const deleteAttendance =
  async (
    req,
    res
  ) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "ID présence invalide",
          });
      }

      const attendance =
        await Attendance.findOne({
          _id: id,

          church:
            req.churchId,
        });

      if (!attendance) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Présence introuvable",
          });
      }

      const memberId =
        attendance.member;

      await attendance.deleteOne();

      await recalculateMemberVisitHistory(
        req.churchId,
        memberId
      );

      await safeCreateActivityLog({
        req,

        action:
          "DELETE",

        entity:
          "Attendance",

        entityId:
          id,

        description:
          "Suppression d'une présence",
      });

      return res.json({
        success: true,

        message:
          "Présence supprimée avec succès",
      });
    } catch (error) {
      console.error(
        "Erreur deleteAttendance :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message,
        });
    }
  };

// ======================================================
// RÉSUMÉ
// ======================================================

const getAttendanceSummary =
  async (
    req,
    res
  ) => {
    try {
      const baseFilter = {
        church:
          req.churchId,
      };

      if (
        req.query.event
      ) {
        baseFilter.event =
          req.query.event;
      }

      const [
        total,
        present,
        absent,
        excused,
        late,
      ] =
        await Promise.all([
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

      const attended =
        present + late;

      const attendanceRate =
        total > 0
          ? Number(
              (
                (
                  attended /
                  total
                ) *
                100
              ).toFixed(2)
            )
          : 0;

      return res.json({
        success: true,

        data: {
          total,
          present,
          absent,
          excused,
          late,
          attended,
          attendanceRate,
        },
      });
    } catch (error) {
      console.error(
        "Erreur getAttendanceSummary :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message,
        });
    }
  };

// ======================================================
// STATISTIQUES D'UN ÉVÉNEMENT
// ======================================================

const getEventAttendanceAnalytics =
  async (
    req,
    res
  ) => {
    try {
      const {
        eventId,
      } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          eventId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "ID événement invalide",
          });
      }

      const event =
        await Event.findOne({
          _id:
            eventId,

          church:
            req.churchId,
        });

      if (!event) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Événement introuvable",
          });
      }

      const statistics =
        await buildEventStatistics(
          req.churchId,
          event
        );

      return res.json({
        success: true,

        data:
          statistics,
      });
    } catch (error) {
      console.error(
        "Erreur getEventAttendanceAnalytics :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message,
        });
    }
  };

// ======================================================
// STATISTIQUES GLOBALES
// ======================================================

const getGlobalAttendanceAnalytics =
  async (
    req,
    res
  ) => {
    try {
      const {
        period = "all",
        startDate,
        endDate,
      } = req.query;

      const eventFilter = {
        church:
          req.churchId,

        status: {
          $nin: [
            "Annulé",
            "cancelled",
          ],
        },
      };

      const now =
        new Date();

      let from = null;
      let to = null;

      if (
        period === "week"
      ) {
        from =
          new Date(now);

        from.setDate(
          now.getDate() - 7
        );
      }

      if (
        period === "month"
      ) {
        from =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            1
          );
      }

      if (
        period === "year"
      ) {
        from =
          new Date(
            now.getFullYear(),
            0,
            1
          );
      }

      if (
        period === "custom"
      ) {
        if (
          startDate
        ) {
          from =
            new Date(startDate);
        }

        if (
          endDate
        ) {
          to =
            new Date(endDate);

          to.setHours(
            23,
            59,
            59,
            999
          );
        }
      }

      if (
        from ||
        to
      ) {
        eventFilter.date =
          {};

        if (
          from &&
          !Number.isNaN(
            from.getTime()
          )
        ) {
          eventFilter.date.$gte =
            from;
        }

        if (
          to &&
          !Number.isNaN(
            to.getTime()
          )
        ) {
          eventFilter.date.$lte =
            to;
        }
      }

      const events =
        await Event.find(
          eventFilter
        ).sort({
          date: 1,
        });

      const eventIds =
        events.map(
          (event) =>
            event._id
        );

      const totalMembers =
        await Member.countDocuments({
          church:
            req.churchId,
        });

      const attendanceFilter = {
        church:
          req.churchId,
      };

      if (
        eventIds.length > 0
      ) {
        attendanceFilter.event =
          {
            $in:
              eventIds,
          };
      } else if (
        period !== "all"
      ) {
        attendanceFilter.event =
          {
            $in: [],
          };
      }

      const attendances =
        await Attendance.find(
          attendanceFilter
        );

      const presentCount =
        attendances.filter(
          (item) =>
            item.status ===
            "Présent"
        ).length;

      const lateCount =
        attendances.filter(
          (item) =>
            item.status ===
            "En retard"
        ).length;

      const absentCount =
        attendances.filter(
          (item) =>
            item.status ===
            "Absent"
        ).length;

      const excusedCount =
        attendances.filter(
          (item) =>
            item.status ===
            "Excusé"
        ).length;

      const totalAttendances =
        presentCount +
        lateCount;

      const eventsAnalytics =
        await Promise.all(
          events.map(
            async (event) => {
              const stats =
                await buildEventStatistics(
                  req.churchId,
                  event
                );

              const notMarked =
                Math.max(
                  totalMembers -
                    stats.totalMarked,
                  0
                );

              const attended =
                stats.present +
                stats.late;

              const attendanceRate =
                totalMembers > 0
                  ? Number(
                      (
                        (
                          attended /
                          totalMembers
                        ) *
                        100
                      ).toFixed(2)
                    )
                  : 0;

              return {
                eventId:
                  event._id,

                title:
                  event.title,

                date:
                  event.date,

                type:
                  event.type,

                status:
                  event.status,

                present:
                  stats.present,

                late:
                  stats.late,

                absent:
                  stats.absent,

                excused:
                  stats.excused,

                notMarked,

                attendanceRate,
              };
            }
          )
        );

      const eventsWithAttendance =
        eventsAnalytics.filter(
          (event) =>
            event.present +
              event.late +
              event.absent +
              event.excused >
            0
        );

      let bestAttendanceEvent =
        null;

      if (
        eventsWithAttendance.length >
        0
      ) {
        bestAttendanceEvent =
          eventsWithAttendance.reduce(
            (
              best,
              current
            ) =>
              current.attendanceRate >
              best.attendanceRate
                ? current
                : best
          );
      }

      return res.json({
        success: true,

        data: {
          period,

          startDate:
            from || null,

          endDate:
            to || null,

          overview: {
            totalMembers,

            presentCount,

            lateCount,

            absentCount,

            excusedCount,

            totalAttendances,
          },

          bestAttendanceEvent,

          eventsAnalytics,
        },
      });
    } catch (error) {
      console.error(
        "Erreur getGlobalAttendanceAnalytics :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message,
        });
    }
  };

// ======================================================
// STATISTIQUES DIMANCHES
// ======================================================

const getSundayAttendanceAnalytics =
  async (
    req,
    res
  ) => {
    try {
      const {
        from,
        to,
      } = req.query;

      const requestedLimit =
        parseInt(
          req.query.limit,
          10
        ) || 12;

      const limit =
        Math.min(
          Math.max(
            requestedLimit,
            1
          ),
          100
        );

      const eventFilter = {
        church:
          req.churchId,

        status: {
          $nin: [
            "Annulé",
            "cancelled",
          ],
        },
      };

      if (
        from ||
        to
      ) {
        eventFilter.date =
          {};

        if (
          from
        ) {
          const start =
            new Date(from);

          if (
            !Number.isNaN(
              start.getTime()
            )
          ) {
            eventFilter.date.$gte =
              start;
          }
        }

        if (
          to
        ) {
          const end =
            new Date(to);

          if (
            !Number.isNaN(
              end.getTime()
            )
          ) {
            end.setHours(
              23,
              59,
              59,
              999
            );

            eventFilter.date.$lte =
              end;
          }
        }
      }

      const events =
        await Event.find(
          eventFilter
        ).sort({
          date: -1,
        });

      const sundayEvents =
        events.filter(
          (event) =>
            event.isSundayService ===
              true ||
            new Date(
              event.date
            ).getDay() === 0
        );

      const now =
        new Date();

      const eligibleSundayEvents =
        [];

      for (
        const event of sundayEvents
      ) {
        const isPast =
          new Date(
            event.date
          ) <= now;

        const attendanceCount =
          await Attendance.countDocuments({
            church:
              req.churchId,

            event:
              event._id,
          });

        if (
          isPast ||
          attendanceCount > 0
        ) {
          eligibleSundayEvents.push(
            event
          );
        }

        if (
          eligibleSundayEvents.length >=
          limit
        ) {
          break;
        }
      }

      const statistics =
        await Promise.all(
          eligibleSundayEvents.map(
            (event) =>
              buildEventStatistics(
                req.churchId,
                event
              )
          )
        );

      statistics.sort(
        (a, b) =>
          new Date(
            a.event.date
          ) -
          new Date(
            b.event.date
          )
      );

      const numberOfSundays =
        statistics.length;

      const totalAttendance =
        statistics.reduce(
          (
            total,
            item
          ) =>
            total +
            item.totalAttendance,
          0
        );

      const totalNewPeople =
        statistics.reduce(
          (
            total,
            item
          ) =>
            total +
            item.people.newPeople,
          0
        );

      const averageAttendance =
        numberOfSundays > 0
          ? Number(
              (
                totalAttendance /
                numberOfSundays
              ).toFixed(2)
            )
          : 0;

      const averageNewPeople =
        numberOfSundays > 0
          ? Number(
              (
                totalNewPeople /
                numberOfSundays
              ).toFixed(2)
            )
          : 0;

      let highestAttendance =
        null;

      statistics.forEach(
        (item) => {
          if (
            !highestAttendance ||
            item.totalAttendance >
              highestAttendance
                .totalAttendance
          ) {
            highestAttendance =
              {
                event:
                  item.event,

                totalAttendance:
                  item.totalAttendance,
              };
          }
        }
      );

      let growthRate = 0;

      if (
        statistics.length >= 2
      ) {
        const previous =
          statistics[
            statistics.length -
              2
          ].totalAttendance;

        const latest =
          statistics[
            statistics.length -
              1
          ].totalAttendance;

        if (
          previous > 0
        ) {
          growthRate =
            Number(
              (
                (
                  (
                    latest -
                    previous
                  ) /
                  previous
                ) *
                100
              ).toFixed(2)
            );
        }
      }

      return res.json({
        success: true,

        summary: {
          numberOfSundays,

          totalAttendance,

          averageAttendance,

          totalNewPeople,

          averageNewPeople,

          growthRate,

          highestAttendance,
        },

        data:
          statistics,
      });
    } catch (error) {
      console.error(
        "Erreur getSundayAttendanceAnalytics :",
        error
      );

      return res
        .status(500)
        .json({
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

  getEventAttendanceAnalytics,

  getGlobalAttendanceAnalytics,

  getSundayAttendanceAnalytics,
};