const mongoose = require("mongoose");

const Member = require(
  "../models/Member"
);

const Department = require(
  "../models/Department"
);

const createActivityLog = require(
  "../utils/createActivityLog"
);

const createPersonHistory = require(
  "../utils/createPersonHistory"
);

// ======================================================
// CONSTANTES
// ======================================================

const AGE_GROUPS = [
  "0-3",
  "4-6",
  "7-10",
  "11-14",
  "15-17",
  "18+",
  "Non renseigné",
];

const GENDERS = [
  "Homme",
  "Femme",
  "",
];

const MEMBER_STATUSES = [
  "Actif",
  "Inactif",
];

const MEMBERSHIP_TYPES = [
  "Membre",
  "Visiteur",
];

const FOLLOW_UP_STATUSES = [
  "Non commencé",
  "À contacter",
  "Contacté",
  "En suivi",
  "Intégré",
  "Clôturé",
];

// ======================================================
// HELPER : ÂGE
// ======================================================

const calculateAge = (
  birthDate,
  referenceDate = new Date()
) => {
  if (!birthDate) {
    return null;
  }

  const birth =
    new Date(birthDate);

  const reference =
    new Date(referenceDate);

  if (
    Number.isNaN(
      birth.getTime()
    ) ||
    Number.isNaN(
      reference.getTime()
    )
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

// ======================================================
// HELPER : TRANCHE D'ÂGE
// ======================================================

const getAgeGroup = (
  age
) => {
  if (
    age === null ||
    typeof age ===
      "undefined"
  ) {
    return "Non renseigné";
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

// ======================================================
// HELPER : DATE
// ======================================================

const normalizeDate = (
  value
) => {
  if (
    value === null ||
    value === "" ||
    typeof value ===
      "undefined"
  ) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
};

// ======================================================
// HELPER : LOG NON BLOQUANT
// ======================================================

const safeCreateActivityLog =
  async (payload) => {
    try {
      await createActivityLog(
        payload
      );
    } catch (error) {
      console.error(
        "Erreur ActivityLog Member :",
        error.message
      );
    }
  };

// ======================================================
// HELPER : POPULATE MEMBRE
// ======================================================

const getPopulatedMember =
  async (
    memberId,
    churchId
  ) => {
    return Member.findOne({
      _id: memberId,
      church: churchId,
    })
      .populate(
        "department",
        "name description"
      )
      .populate(
        "followUpAssignedTo",
        "name email role"
      );
  };

// ======================================================
// HELPER : VÉRIFIER DÉPARTEMENT
// ======================================================

const validateDepartment =
  async (
    departmentId,
    churchId
  ) => {
    if (!departmentId) {
      return {
        valid: true,
        department: null,
      };
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        departmentId
      )
    ) {
      return {
        valid: false,
        message:
          "Identifiant de département invalide",
      };
    }

    const department =
      await Department.findOne({
        _id: departmentId,
        church: churchId,
      });

    if (!department) {
      return {
        valid: false,
        message:
          "Département introuvable dans cette église",
      };
    }

    return {
      valid: true,
      department,
    };
  };

// ======================================================
// CRÉER UN MEMBRE / VISITEUR
// ======================================================

const createMember =
  async (
    req,
    res
  ) => {
    try {
      if (!req.churchId) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "Aucune église associée à cet utilisateur",
          });
      }

      const {
        firstName,
        lastName,
        gender = "",
        birthDate = null,
        ageGroup =
          "Non renseigné",

        phone = "",
        email = "",
        address = "",

        department = null,
        status = "Actif",

        membershipType =
          "Membre",

        membershipDate =
          null,

        followUpStatus,
        followUpAssignedTo =
          null,

        followUpNote = "",
        lastContactDate =
          null,

        nextFollowUpDate =
          null,
      } = req.body;

      // ==================================================
      // NOM / PRÉNOM
      // ==================================================

      if (
        !firstName ||
        !String(firstName).trim()
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Le prénom est obligatoire",
          });
      }

      if (
        !lastName ||
        !String(lastName).trim()
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Le nom est obligatoire",
          });
      }

      // ==================================================
      // VALIDATIONS
      // ==================================================

      if (
        !GENDERS.includes(
          gender
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Sexe invalide",
          });
      }

      if (
        !MEMBER_STATUSES.includes(
          status
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Statut du membre invalide",
          });
      }

      if (
        !MEMBERSHIP_TYPES.includes(
          membershipType
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Profil invalide : utilisez Membre ou Visiteur",
          });
      }

      // ==================================================
      // DÉPARTEMENT
      // ==================================================

      const departmentCheck =
        await validateDepartment(
          department,
          req.churchId
        );

      if (
        !departmentCheck.valid
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              departmentCheck.message,
          });
      }

      // ==================================================
      // DATE DE NAISSANCE / ÂGE
      // ==================================================

      let normalizedBirthDate =
        null;

      let finalAgeGroup =
        ageGroup;

      if (birthDate) {
        normalizedBirthDate =
          normalizeDate(
            birthDate
          );

        if (
          !normalizedBirthDate
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Date de naissance invalide",
            });
        }

        const age =
          calculateAge(
            normalizedBirthDate
          );

        finalAgeGroup =
          getAgeGroup(
            age
          );
      } else if (
        !AGE_GROUPS.includes(
          ageGroup
        )
      ) {
        finalAgeGroup =
          "Non renseigné";
      }

      // ==================================================
      // TYPE MEMBRE / VISITEUR
      // ==================================================

      let finalMembershipDate =
        normalizeDate(
          membershipDate
        );

      let finalFollowUpStatus =
        followUpStatus;

      if (
        membershipType ===
        "Membre"
      ) {
        finalFollowUpStatus =
          finalFollowUpStatus ||
          "Intégré";
      }

      if (
        membershipType ===
        "Visiteur"
      ) {
        finalMembershipDate =
          null;

        finalFollowUpStatus =
          finalFollowUpStatus ||
          "À contacter";
      }

      if (
        !FOLLOW_UP_STATUSES.includes(
          finalFollowUpStatus
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Statut de suivi invalide",
          });
      }

      // ==================================================
      // UTILISATEUR ASSIGNÉ AU SUIVI
      // ==================================================

      let assignedTo =
        null;

      if (
        followUpAssignedTo
      ) {
        if (
          !mongoose.Types.ObjectId.isValid(
            followUpAssignedTo
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Utilisateur de suivi invalide",
            });
        }

        assignedTo =
          followUpAssignedTo;
      }

      // ==================================================
      // CRÉATION
      // ==================================================

      const member =
        await Member.create({
          church:
            req.churchId,

          firstName:
            String(
              firstName
            ).trim(),

          lastName:
            String(
              lastName
            ).trim(),

          gender,

          birthDate:
            normalizedBirthDate,

          ageGroup:
            finalAgeGroup,

          phone:
            typeof phone ===
            "string"
              ? phone.trim()
              : "",

          email:
            typeof email ===
            "string"
              ? email
                  .trim()
                  .toLowerCase()
              : "",

          address:
            typeof address ===
            "string"
              ? address.trim()
              : "",

          department:
            departmentCheck
              .department
              ? departmentCheck
                  .department._id
              : null,

          status,

          membershipType,

          membershipDate:
            finalMembershipDate,

          firstVisitDate:
            null,

          lastVisitDate:
            null,

          visitCount: 0,

          followUpStatus:
            finalFollowUpStatus,

          followUpAssignedTo:
            assignedTo,

          followUpNote:
            typeof followUpNote ===
            "string"
              ? followUpNote.trim()
              : "",

          lastContactDate:
            normalizeDate(
              lastContactDate
            ),

          nextFollowUpDate:
            normalizeDate(
              nextFollowUpDate
            ),
        });

      // ==================================================
      // HISTORIQUE PERSONNE : CRÉATION
      // ==================================================

      await createPersonHistory({
        req,

        churchId:
          req.churchId,

        memberId:
          member._id,

        type:
          "PERSON_CREATED",

        category:
          "Identité",

        title:
          membershipType ===
          "Visiteur"
            ? "Profil visiteur créé"
            : "Profil membre créé",

        description:
          `${member.firstName} ${member.lastName} a été ajouté à l'église comme ${membershipType.toLowerCase()}.`,

        occurredAt:
          member.createdAt ||
          new Date(),

        previousValue:
          null,

        newValue:
          membershipType,

        sourceType:
          "Member",

        sourceId:
          member._id,

        metadata: {
          firstName:
            member.firstName,

          lastName:
            member.lastName,

          membershipType:
            member.membershipType,

          status:
            member.status,

          membershipDate:
            member.membershipDate ||
            null,

          followUpStatus:
            member.followUpStatus ||
            null,

          department:
            member.department ||
            null,
        },

        origin:
          "automatic",

        visibility:
          "standard",
      });

      const populatedMember =
        await getPopulatedMember(
          member._id,
          req.churchId
        );

      await safeCreateActivityLog({
        req,

        action:
          "CREATE",

        entity:
          "Member",

        entityId:
          member._id,

        description:
          `${membershipType} ajouté : ${member.firstName} ${member.lastName}`,
      });

      return res
        .status(201)
        .json({
          success: true,

          message:
            membershipType ===
            "Visiteur"
              ? "Visiteur ajouté avec succès"
              : "Membre ajouté avec succès",

          data:
            populatedMember,
        });
    } catch (error) {
      console.error(
        "Erreur createMember :",
        error
      );

      if (
        error.name ===
        "ValidationError"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              error.message,
          });
      }

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message ||
            "Erreur lors de la création du membre",
        });
    }
  };

// ======================================================
// LISTE DES MEMBRES
// ======================================================

const getMembers =
  async (
    req,
    res
  ) => {
    try {
      if (!req.churchId) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "Aucune église associée à cet utilisateur",
          });
      }

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
            ) || 20,
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

      // ==================================================
      // RECHERCHE
      // ==================================================

      if (
        req.query.search
      ) {
        const search =
          String(
            req.query.search
          ).trim();

        if (search) {
          filter.$or = [
            {
              firstName: {
                $regex:
                  search,
                $options:
                  "i",
              },
            },

            {
              lastName: {
                $regex:
                  search,
                $options:
                  "i",
              },
            },

            {
              email: {
                $regex:
                  search,
                $options:
                  "i",
              },
            },

            {
              phone: {
                $regex:
                  search,
                $options:
                  "i",
              },
            },
          ];
        }
      }

      // ==================================================
      // FILTRES
      // ==================================================

      if (
        req.query.status &&
        MEMBER_STATUSES.includes(
          req.query.status
        )
      ) {
        filter.status =
          req.query.status;
      }

      if (
        req.query.membershipType &&
        MEMBERSHIP_TYPES.includes(
          req.query
            .membershipType
        )
      ) {
        filter.membershipType =
          req.query
            .membershipType;
      }

      if (
        req.query.gender &&
        GENDERS.includes(
          req.query.gender
        )
      ) {
        filter.gender =
          req.query.gender;
      }

      if (
        req.query.ageGroup &&
        AGE_GROUPS.includes(
          req.query.ageGroup
        )
      ) {
        filter.ageGroup =
          req.query.ageGroup;
      }

      if (
        req.query.department &&
        mongoose.Types.ObjectId.isValid(
          req.query.department
        )
      ) {
        filter.department =
          req.query.department;
      }

      if (
        req.query.followUpStatus &&
        FOLLOW_UP_STATUSES.includes(
          req.query
            .followUpStatus
        )
      ) {
        filter.followUpStatus =
          req.query
            .followUpStatus;
      }

      // ==================================================
      // REQUÊTES
      // ==================================================

      const [
        total,
        members,
      ] =
        await Promise.all([
          Member.countDocuments(
            filter
          ),

          Member.find(
            filter
          )
            .populate(
              "department",
              "name description"
            )
            .populate(
              "followUpAssignedTo",
              "name email role"
            )
            .sort({
              createdAt: -1,
            })
            .skip(skip)
            .limit(limit),
        ]);

      // ==================================================
      // STATISTIQUES
      // ==================================================

      const [
        totalPeople,
        activeMembers,
        inactiveMembers,
        membersCount,
        visitorsCount,
      ] =
        await Promise.all([
          Member.countDocuments({
            church:
              req.churchId,
          }),

          Member.countDocuments({
            church:
              req.churchId,
            status:
              "Actif",
          }),

          Member.countDocuments({
            church:
              req.churchId,
            status:
              "Inactif",
          }),

          Member.countDocuments({
            church:
              req.churchId,
            membershipType:
              "Membre",
          }),

          Member.countDocuments({
            church:
              req.churchId,
            membershipType:
              "Visiteur",
          }),
        ]);

      return res
        .status(200)
        .json({
          success: true,

          page,
          limit,
          total,

          totalPages:
            Math.ceil(
              total /
              limit
            ),

          count:
            members.length,

          stats: {
            total:
              totalPeople,

            active:
              activeMembers,

            inactive:
              inactiveMembers,

            members:
              membersCount,

            visitors:
              visitorsCount,
          },

          data:
            members,
        });
    } catch (error) {
      console.error(
        "Erreur getMembers :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message ||
            "Impossible de récupérer les membres",
        });
    }
  };

// ======================================================
// DÉTAIL D'UN MEMBRE
// ======================================================

const getMemberById =
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
              "Identifiant du membre invalide",
          });
      }

      const member =
        await getPopulatedMember(
          id,
          req.churchId
        );

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Membre introuvable",
          });
      }

      return res
        .status(200)
        .json({
          success: true,
          data:
            member,
        });
    } catch (error) {
      console.error(
        "Erreur getMemberById :",
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
// MODIFIER UN MEMBRE
// ======================================================

const updateMember =
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
              "Identifiant du membre invalide",
          });
      }

      const member =
        await Member.findOne({
          _id: id,
          church:
            req.churchId,
        });

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Membre introuvable",
          });
      }

      // ==================================================
      // ÉTAT AVANT MODIFICATION
      // ==================================================

      const previousStatus =
        member.status;

      const previousMembershipType =
        member.membershipType;

      const previousMembershipDate =
        member.membershipDate ||
        null;

      const previousFollowUpStatus =
        member.followUpStatus ||
        null;

      const {
        firstName,
        lastName,
        gender,
        birthDate,
        ageGroup,

        phone,
        email,
        address,

        department,
        status,

        membershipType,
        membershipDate,

        followUpStatus,
        followUpAssignedTo,
        followUpNote,
        lastContactDate,
        nextFollowUpDate,
      } = req.body;

      // ==================================================
      // IDENTITÉ
      // ==================================================

      if (
        typeof firstName !==
        "undefined"
      ) {
        if (
          !String(
            firstName
          ).trim()
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Le prénom ne peut pas être vide",
            });
        }

        member.firstName =
          String(
            firstName
          ).trim();
      }

      if (
        typeof lastName !==
        "undefined"
      ) {
        if (
          !String(
            lastName
          ).trim()
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Le nom ne peut pas être vide",
            });
        }

        member.lastName =
          String(
            lastName
          ).trim();
      }

      if (
        typeof gender !==
        "undefined"
      ) {
        if (
          !GENDERS.includes(
            gender
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Sexe invalide",
            });
        }

        member.gender =
          gender;
      }

      // ==================================================
      // DATE DE NAISSANCE
      // ==================================================

      if (
        typeof birthDate !==
        "undefined"
      ) {
        if (
          birthDate ===
            "" ||
          birthDate ===
            null
        ) {
          member.birthDate =
            null;

          if (
            typeof ageGroup !==
              "undefined" &&
            AGE_GROUPS.includes(
              ageGroup
            )
          ) {
            member.ageGroup =
              ageGroup;
          } else {
            member.ageGroup =
              "Non renseigné";
          }
        } else {
          const parsedBirthDate =
            normalizeDate(
              birthDate
            );

          if (
            !parsedBirthDate
          ) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Date de naissance invalide",
              });
          }

          member.birthDate =
            parsedBirthDate;

          const age =
            calculateAge(
              parsedBirthDate
            );

          member.ageGroup =
            getAgeGroup(
              age
            );
        }
      } else if (
        typeof ageGroup !==
          "undefined" &&
        !member.birthDate
      ) {
        if (
          !AGE_GROUPS.includes(
            ageGroup
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Tranche d'âge invalide",
            });
        }

        member.ageGroup =
          ageGroup;
      }

      // ==================================================
      // CONTACT
      // ==================================================

      if (
        typeof phone !==
        "undefined"
      ) {
        member.phone =
          typeof phone ===
          "string"
            ? phone.trim()
            : "";
      }

      if (
        typeof email !==
        "undefined"
      ) {
        member.email =
          typeof email ===
          "string"
            ? email
                .trim()
                .toLowerCase()
            : "";
      }

      if (
        typeof address !==
        "undefined"
      ) {
        member.address =
          typeof address ===
          "string"
            ? address.trim()
            : "";
      }

      // ==================================================
      // DÉPARTEMENT
      // ==================================================

      if (
        typeof department !==
        "undefined"
      ) {
        if (
          department ===
            "" ||
          department ===
            null
        ) {
          member.department =
            null;
        } else {
          const departmentCheck =
            await validateDepartment(
              department,
              req.churchId
            );

          if (
            !departmentCheck.valid
          ) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  departmentCheck.message,
              });
          }

          member.department =
            departmentCheck
              .department._id;
        }
      }

      // ==================================================
      // STATUT
      // ==================================================

      if (
        typeof status !==
        "undefined"
      ) {
        if (
          !MEMBER_STATUSES.includes(
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

        member.status =
          status;
      }

      // ==================================================
      // MEMBRE / VISITEUR
      // ==================================================

      if (
        typeof membershipType !==
        "undefined"
      ) {
        if (
          !MEMBERSHIP_TYPES.includes(
            membershipType
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Profil invalide",
            });
        }

        member.membershipType =
          membershipType;

        if (
          membershipType ===
          "Visiteur"
        ) {
          member.membershipDate =
            null;

          if (
            member.followUpStatus ===
            "Intégré"
          ) {
            member.followUpStatus =
              "À contacter";
          }
        }

        if (
          membershipType ===
            "Membre" &&
          (
            member.followUpStatus ===
              "Non commencé" ||
            member.followUpStatus ===
              "À contacter" ||
            member.followUpStatus ===
              "Contacté" ||
            member.followUpStatus ===
              "En suivi"
          )
        ) {
          member.followUpStatus =
            "Intégré";
        }
      }

      if (
        typeof membershipDate !==
        "undefined"
      ) {
        if (
          member.membershipType ===
          "Visiteur"
        ) {
          member.membershipDate =
            null;
        } else {
          member.membershipDate =
            normalizeDate(
              membershipDate
            );
        }
      }

      // ==================================================
      // SUIVI
      // ==================================================

      if (
        typeof followUpStatus !==
        "undefined"
      ) {
        if (
          !FOLLOW_UP_STATUSES.includes(
            followUpStatus
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Statut de suivi invalide",
            });
        }

        member.followUpStatus =
          followUpStatus;
      }

      if (
        typeof followUpAssignedTo !==
        "undefined"
      ) {
        if (
          !followUpAssignedTo
        ) {
          member.followUpAssignedTo =
            null;
        } else {
          if (
            !mongoose.Types.ObjectId.isValid(
              followUpAssignedTo
            )
          ) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Utilisateur de suivi invalide",
              });
          }

          member.followUpAssignedTo =
            followUpAssignedTo;
        }
      }

      if (
        typeof followUpNote !==
        "undefined"
      ) {
        member.followUpNote =
          typeof followUpNote ===
          "string"
            ? followUpNote.trim()
            : "";
      }

      if (
        typeof lastContactDate !==
        "undefined"
      ) {
        member.lastContactDate =
          normalizeDate(
            lastContactDate
          );
      }

      if (
        typeof nextFollowUpDate !==
        "undefined"
      ) {
        member.nextFollowUpDate =
          normalizeDate(
            nextFollowUpDate
          );
      }

      // ==================================================
      // SAUVEGARDE
      // ==================================================

      await member.save();

      const historyDate =
        new Date();

      // ==================================================
      // HISTORIQUE : STATUT ACTIF / INACTIF
      // ==================================================

      if (
        previousStatus !==
        member.status
      ) {
        await createPersonHistory({
          req,

          churchId:
            req.churchId,

          memberId:
            member._id,

          type:
            "STATUS_CHANGED",

          category:
            "Administration",

          title:
            `Statut : ${previousStatus} → ${member.status}`,

          description:
            `Le statut de ${member.firstName} ${member.lastName} est passé de « ${previousStatus} » à « ${member.status} ».`,

          occurredAt:
            historyDate,

          previousValue:
            previousStatus,

          newValue:
            member.status,

          sourceType:
            "Member",

          sourceId:
            member._id,

          metadata: {
            previousStatus,
            newStatus:
              member.status,
          },

          origin:
            "automatic",

          visibility:
            "standard",
        });
      }

      // ==================================================
      // HISTORIQUE : MEMBRE / VISITEUR
      // ==================================================

      if (
        previousMembershipType !==
        member.membershipType
      ) {
        await createPersonHistory({
          req,

          churchId:
            req.churchId,

          memberId:
            member._id,

          type:
            "MEMBERSHIP_CHANGED",

          category:
            "Intégration",

          title:
            `Profil : ${previousMembershipType} → ${member.membershipType}`,

          description:
            `${member.firstName} ${member.lastName} est passé du profil « ${previousMembershipType} » au profil « ${member.membershipType} ».`,

          occurredAt:
            historyDate,

          previousValue:
            previousMembershipType,

          newValue:
            member.membershipType,

          sourceType:
            "Member",

          sourceId:
            member._id,

          metadata: {
            previousMembershipType,

            newMembershipType:
              member.membershipType,

            previousMembershipDate,

            newMembershipDate:
              member.membershipDate ||
              null,

            previousFollowUpStatus,

            newFollowUpStatus:
              member.followUpStatus ||
              null,
          },

          origin:
            "automatic",

          visibility:
            "standard",
        });
      }

      const updatedMember =
        await getPopulatedMember(
          member._id,
          req.churchId
        );

      await safeCreateActivityLog({
        req,

        action:
          "UPDATE",

        entity:
          "Member",

        entityId:
          member._id,

        description:
          `Membre modifié : ${member.firstName} ${member.lastName}`,
      });

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Membre modifié avec succès",

          data:
            updatedMember,
        });
    } catch (error) {
      console.error(
        "Erreur updateMember :",
        error
      );

      if (
        error.name ===
        "ValidationError"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              error.message,
          });
      }

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message ||
            "Erreur lors de la modification du membre",
        });
    }
  };

// ======================================================
// SUPPRIMER UN MEMBRE
// ======================================================

const deleteMember =
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
              "Identifiant du membre invalide",
          });
      }

      const member =
        await Member.findOne({
          _id: id,
          church:
            req.churchId,
        });

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Membre introuvable",
          });
      }

      /*
       * On ne supprime PAS ici automatiquement
       * les présences historiques.
       *
       * Les statistiques d'église peuvent avoir
       * besoin de conserver l'historique.
       *
       * À terme, pour une architecture SaaS
       * de production, on privilégiera
       * l'archivage à la suppression physique.
       */

      const memberName =
        `${member.firstName} ${member.lastName}`;

      await member.deleteOne();

      await safeCreateActivityLog({
        req,

        action:
          "DELETE",

        entity:
          "Member",

        entityId:
          id,

        description:
          `Membre supprimé : ${memberName}`,
      });

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Membre supprimé avec succès",
        });
    } catch (error) {
      console.error(
        "Erreur deleteMember :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message ||
            "Erreur lors de la suppression du membre",
        });
    }
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  createMember,
  getMembers,
  getMemberById,
  updateMember,
  deleteMember,
};