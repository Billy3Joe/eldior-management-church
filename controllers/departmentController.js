const mongoose =
  require("mongoose");

const Department =
  require("../models/Department");

const Member =
  require("../models/Member");

const createPersonHistory =
  require("../utils/createPersonHistory");

// ======================================================
// CONSTANTES
// ======================================================

const MEMBER_ROLES = [
  "Membre",
  "Responsable",
  "Responsable adjoint",
  "Coordinateur",
  "Assistant",
  "Serviteur",
  "Bénévole",
  "Autre",
];

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (
  value
) =>
  mongoose.Types.ObjectId.isValid(
    value
  );

const escapeRegex = (
  value = ""
) =>
  value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

const cleanText = (
  value
) => {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value.trim();
};

// ======================================================
// TROUVER UN MEMBRE DE LA MÊME ÉGLISE
// ======================================================

const findChurchMember =
  async (
    memberId,
    churchId
  ) => {
    if (
      !memberId ||
      !isValidObjectId(
        memberId
      )
    ) {
      return null;
    }

    return Member.findOne({
      _id: memberId,
      church: churchId,
    });
  };

// ======================================================
// POPULATION STANDARD
// ======================================================

const populateDepartment =
  (query) =>
    query
      .populate({
        path: "leader",
        select:
          "firstName lastName email phone status membershipType spiritualStage",
      })
      .populate({
        path:
          "assistantLeaders",
        select:
          "firstName lastName email phone status membershipType spiritualStage",
      })
      .populate({
        path:
          "members.member",
        select:
          "firstName lastName gender birthDate ageGroup phone email status membershipType spiritualStage",
      })
      .populate({
        path: "createdBy",
        select:
          "name email",
      })
      .populate({
        path: "updatedBy",
        select:
          "name email",
      });

// ======================================================
// CRÉER UN DÉPARTEMENT
// POST /api/departments
// ======================================================

const createDepartment =
  async (req, res) => {
    try {
      const {
        name,
        description,
        status,
        leader,
        assistantLeaders,
        meetingDay,
        meetingTime,
        location,
        color,
        icon,
        notes,
      } = req.body;

      const cleanName =
        cleanText(name);

      if (!cleanName) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Le nom du département est obligatoire.",
          });
      }

      const existingDepartment =
        await Department.findOne({
          church:
            req.churchId,

          name: {
            $regex:
              new RegExp(
                `^${escapeRegex(
                  cleanName
                )}$`,
                "i"
              ),
          },
        });

      if (
        existingDepartment
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Un département avec ce nom existe déjà.",
          });
      }

      let validLeader =
        null;

      if (leader) {
        const member =
          await findChurchMember(
            leader,
            req.churchId
          );

        if (!member) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Le responsable sélectionné n'appartient pas à cette église.",
            });
        }

        validLeader =
          member._id;
      }

      const validAssistants =
        [];

      if (
        Array.isArray(
          assistantLeaders
        )
      ) {
        const uniqueIds = [
          ...new Set(
            assistantLeaders
              .filter(Boolean)
              .map(String)
          ),
        ];

        for (
          const memberId
          of uniqueIds
        ) {
          const member =
            await findChurchMember(
              memberId,
              req.churchId
            );

          if (!member) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Un responsable adjoint sélectionné n'appartient pas à cette église.",
              });
          }

          if (
            validLeader &&
            String(
              validLeader
            ) ===
              String(
                member._id
              )
          ) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Le responsable principal ne peut pas également être responsable adjoint.",
              });
          }

          validAssistants.push(
            member._id
          );
        }
      }

      const department =
        await Department.create({
          church:
            req.churchId,

          name:
            cleanName,

          description:
            cleanText(
              description
            ),

          status:
            status ||
            "active",

          leader:
            validLeader,

          assistantLeaders:
            validAssistants,

          meetingDay:
            cleanText(
              meetingDay
            ),

          meetingTime:
            cleanText(
              meetingTime
            ),

          location:
            cleanText(
              location
            ),

          color:
            cleanText(
              color
            ),

          icon:
            cleanText(
              icon
            ),

          notes:
            cleanText(
              notes
            ),

          createdBy:
            req.user?._id ||
            null,

          updatedBy:
            req.user?._id ||
            null,
        });

      const populated =
        await populateDepartment(
          Department.findById(
            department._id
          )
        );

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Département créé avec succès.",
          data:
            populated,
        });
    } catch (error) {
      console.error(
        "Erreur createDepartment :",
        error
      );

      if (
        error?.code ===
        11000
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Un département avec ce nom existe déjà.",
          });
      }

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Erreur lors de la création du département.",
          error:
            process.env
              .NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
    }
  };

// ======================================================
// LISTE DES DÉPARTEMENTS
// GET /api/departments
// ======================================================

const getDepartments =
  async (req, res) => {
    try {
      const {
        search = "",
        status = "",
        page = 1,
        limit = 20,
      } = req.query;

      const numericPage =
        Math.max(
          parseInt(
            page,
            10
          ) || 1,
          1
        );

      const numericLimit =
        Math.min(
          Math.max(
            parseInt(
              limit,
              10
            ) || 20,
            1
          ),
          1000
        );

      const filter = {
        church:
          req.churchId,
      };

      if (
        search.trim()
      ) {
        filter.name = {
          $regex:
            escapeRegex(
              search.trim()
            ),

          $options:
            "i",
        };
      }

      if (status) {
        filter.status =
          status;
      }

      const skip =
        (
          numericPage -
          1
        ) *
        numericLimit;

      const [
        departments,
        total,
      ] =
        await Promise.all([
          populateDepartment(
            Department.find(
              filter
            )
          )
            .sort({
              createdAt:
                -1,
            })
            .skip(skip)
            .limit(
              numericLimit
            ),

          Department.countDocuments(
            filter
          ),
        ]);

      const data =
        departments.map(
          (department) => {
            const object =
              department.toObject({
                virtuals:
                  true,
              });

            const activeMembers =
              (
                object.members ||
                []
              ).filter(
                (entry) =>
                  entry.isActive !==
                  false
              );

            return {
              ...object,

              memberCount:
                activeMembers.length,

              totalMembers:
                activeMembers.length,
            };
          }
        );

      const totalPages =
        Math.max(
          Math.ceil(
            total /
              numericLimit
          ),
          1
        );

      return res
        .status(200)
        .json({
          success: true,

          data,

          departments:
            data,

          page:
            numericPage,

          limit:
            numericLimit,

          total,

          totalPages,
        });
    } catch (error) {
      console.error(
        "Erreur getDepartments :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors du chargement des départements.",

          error:
            process.env
              .NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
    }
  };

// ======================================================
// STATISTIQUES
// GET /api/departments/stats/all
// ======================================================

const getDepartmentStats =
  async (req, res) => {
    try {
      const departments =
        await Department.find({
          church:
            req.churchId,
        }).lean();

      let totalAssignments =
        0;

      const uniqueMemberIds =
        new Set();

      const data =
        departments.map(
          (department) => {
            const activeMembers =
              (
                department.members ||
                []
              ).filter(
                (entry) =>
                  entry.isActive !==
                  false
              );

            const inactiveMembers =
              (
                department.members ||
                []
              ).filter(
                (entry) =>
                  entry.isActive ===
                  false
              );

            activeMembers.forEach(
              (entry) => {
                if (
                  entry.member
                ) {
                  uniqueMemberIds.add(
                    String(
                      entry.member
                    )
                  );
                }
              }
            );

            totalAssignments +=
              activeMembers.length;

            return {
              _id:
                department._id,

              name:
                department.name,

              leader:
                department.leader ||
                null,

              status:
                department.status ||
                "active",

              totalMembers:
                activeMembers.length,

              activeMembers:
                activeMembers.length,

              inactiveMembers:
                inactiveMembers.length,
            };
          }
        );

      const totalDepartments =
        departments.length;

      const activeDepartments =
        departments.filter(
          (department) =>
            department.status ===
            "active"
        ).length;

      const inactiveDepartments =
        departments.filter(
          (department) =>
            department.status ===
            "inactive"
        ).length;

      const totalChurchMembers =
        await Member.countDocuments({
          church:
            req.churchId,

          status:
            "Actif",

          membershipType: {
            $ne:
              "Visiteur",
          },
        });

      const membersInDepartments =
        uniqueMemberIds.size;

      const membersWithoutDepartment =
        Math.max(
          totalChurchMembers -
            membersInDepartments,
          0
        );

      const coverageRate =
        totalChurchMembers >
        0
          ? Number(
              (
                (
                  membersInDepartments /
                  totalChurchMembers
                ) *
                100
              ).toFixed(1)
            )
          : 0;

      const averageDepartmentSize =
        activeDepartments >
        0
          ? Number(
              (
                totalAssignments /
                activeDepartments
              ).toFixed(1)
            )
          : 0;

      return res
        .status(200)
        .json({
          success: true,

          data,

          departments:
            data,

          summary: {
            totalDepartments,

            activeDepartments,

            inactiveDepartments,

            totalMembers:
              totalAssignments,

            activeMembers:
              totalAssignments,

            inactiveMembers:
              data.reduce(
                (
                  total,
                  department
                ) =>
                  total +
                  department
                    .inactiveMembers,
                0
              ),

            totalChurchMembers,

            membersInDepartments,

            membersWithoutDepartment,

            coverageRate,

            averageDepartmentSize,
          },
        });
    } catch (error) {
      console.error(
        "Erreur getDepartmentStats :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors du chargement des statistiques des départements.",

          error:
            process.env
              .NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
    }
  };

// ======================================================
// DÉPARTEMENTS D'UNE PERSONNE
// GET /api/departments/member/:memberId
// ======================================================

const getMemberDepartments =
  async (req, res) => {
    try {
      const {
        memberId,
      } = req.params;

      if (
        !isValidObjectId(
          memberId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant de la personne invalide.",
          });
      }

      const member =
        await findChurchMember(
          memberId,
          req.churchId
        );

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Personne introuvable dans cette église.",
          });
      }

      const departments =
        await populateDepartment(
          Department.find({
            church:
              req.churchId,

            members: {
              $elemMatch: {
                member:
                  memberId,

                isActive:
                  true,
              },
            },
          })
        ).sort({
          name: 1,
        });

      return res
        .status(200)
        .json({
          success: true,

          data: {
            member: {
              _id:
                member._id,

              firstName:
                member.firstName,

              lastName:
                member.lastName,
            },

            departments,
          },
        });
    } catch (error) {
      console.error(
        "Erreur getMemberDepartments :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors du chargement des départements de cette personne.",
        });
    }
  };

// ======================================================
// RÉCUPÉRER UN DÉPARTEMENT
// GET /api/departments/:id
// ======================================================

const getDepartmentById =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant du département invalide.",
          });
      }

      const department =
        await populateDepartment(
          Department.findOne({
            _id: id,

            church:
              req.churchId,
          })
        );

      if (!department) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Département introuvable.",
          });
      }

      const object =
        department.toObject({
          virtuals: true,
        });

      const activeMembers =
        (
          object.members ||
          []
        ).filter(
          (entry) =>
            entry.isActive !==
            false
        );

      return res
        .status(200)
        .json({
          success: true,

          data: {
            ...object,

            memberCount:
              activeMembers.length,

            totalMembers:
              activeMembers.length,
          },
        });
    } catch (error) {
      console.error(
        "Erreur getDepartmentById :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors du chargement du département.",
        });
    }
  };

// ======================================================
// MODIFIER UN DÉPARTEMENT
// PUT /api/departments/:id
// ======================================================

const updateDepartment =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant du département invalide.",
          });
      }

      const department =
        await Department.findOne({
          _id: id,

          church:
            req.churchId,
        });

      if (!department) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Département introuvable.",
          });
      }

      const {
        name,
        description,
        status,
        leader,
        assistantLeaders,
        meetingDay,
        meetingTime,
        location,
        color,
        icon,
        notes,
      } = req.body;

      if (
        name !== undefined
      ) {
        const cleanName =
          cleanText(name);

        if (!cleanName) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Le nom du département est obligatoire.",
            });
        }

        const duplicate =
          await Department.findOne({
            church:
              req.churchId,

            _id: {
              $ne: id,
            },

            name: {
              $regex:
                new RegExp(
                  `^${escapeRegex(
                    cleanName
                  )}$`,
                  "i"
                ),
            },
          });

        if (duplicate) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Un département avec ce nom existe déjà.",
            });
        }

        department.name =
          cleanName;
      }

      if (
        leader !== undefined
      ) {
        if (
          leader === null ||
          leader === ""
        ) {
          department.leader =
            null;
        } else {
          const member =
            await findChurchMember(
              leader,
              req.churchId
            );

          if (!member) {
            return res
              .status(400)
              .json({
                success: false,

                message:
                  "Le responsable sélectionné n'appartient pas à cette église.",
              });
          }

          department.leader =
            member._id;
        }
      }

      if (
        assistantLeaders !==
        undefined
      ) {
        if (
          !Array.isArray(
            assistantLeaders
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "La liste des responsables adjoints est invalide.",
            });
        }

        const uniqueIds = [
          ...new Set(
            assistantLeaders
              .filter(Boolean)
              .map(String)
          ),
        ];

        const validAssistants =
          [];

        for (
          const memberId
          of uniqueIds
        ) {
          const member =
            await findChurchMember(
              memberId,
              req.churchId
            );

          if (!member) {
            return res
              .status(400)
              .json({
                success: false,

                message:
                  "Un responsable adjoint sélectionné n'appartient pas à cette église.",
              });
          }

          validAssistants.push(
            member._id
          );
        }

        department.assistantLeaders =
          validAssistants;
      }

      if (
        description !==
        undefined
      ) {
        department.description =
          cleanText(
            description
          );
      }

      if (
        status !==
        undefined
      ) {
        department.status =
          status;
      }

      if (
        meetingDay !==
        undefined
      ) {
        department.meetingDay =
          cleanText(
            meetingDay
          );
      }

      if (
        meetingTime !==
        undefined
      ) {
        department.meetingTime =
          cleanText(
            meetingTime
          );
      }

      if (
        location !==
        undefined
      ) {
        department.location =
          cleanText(
            location
          );
      }

      if (
        color !==
        undefined
      ) {
        department.color =
          cleanText(
            color
          );
      }

      if (
        icon !==
        undefined
      ) {
        department.icon =
          cleanText(
            icon
          );
      }

      if (
        notes !==
        undefined
      ) {
        department.notes =
          cleanText(
            notes
          );
      }

      department.updatedBy =
        req.user?._id ||
        null;

      await department.save();

      const updatedDepartment =
        await populateDepartment(
          Department.findById(
            department._id
          )
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Département mis à jour avec succès.",

          data:
            updatedDepartment,
        });
    } catch (error) {
      console.error(
        "Erreur updateDepartment :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors de la modification du département.",

          error:
            process.env
              .NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
    }
  };

// ======================================================
// AJOUTER UNE PERSONNE AU DÉPARTEMENT
// POST /api/departments/:id/members
// ======================================================

const addMemberToDepartment =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const {
        memberId,
        role = "Membre",
        responsibility = "",
        note = "",
      } = req.body;

      if (
        !isValidObjectId(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant du département invalide.",
          });
      }

      if (
        !memberId ||
        !isValidObjectId(
          memberId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Sélectionnez une personne valide.",
          });
      }

      if (
        !MEMBER_ROLES.includes(
          role
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Le rôle sélectionné est invalide.",
          });
      }

      const [
        department,
        member,
      ] =
        await Promise.all([
          Department.findOne({
            _id: id,

            church:
              req.churchId,
          }),

          findChurchMember(
            memberId,
            req.churchId
          ),
        ]);

      if (!department) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Département introuvable.",
          });
      }

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Personne introuvable dans cette église.",
          });
      }

      const existingEntry =
        department.members.find(
          (entry) =>
            String(
              entry.member
            ) ===
            String(
              memberId
            )
        );

      if (
        existingEntry &&
        existingEntry.isActive !==
          false
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Cette personne appartient déjà à ce département.",
          });
      }

      const joinedAt =
        new Date();

      if (existingEntry) {
        existingEntry.isActive =
          true;

        existingEntry.leftAt =
          null;

        existingEntry.joinedAt =
          joinedAt;

        existingEntry.role =
          role;

        existingEntry.responsibility =
          cleanText(
            responsibility
          );

        existingEntry.note =
          cleanText(note);
      } else {
        department.members.push({
          member:
            member._id,

          role,

          responsibility:
            cleanText(
              responsibility
            ),

          joinedAt,

          leftAt:
            null,

          note:
            cleanText(note),

          isActive:
            true,
        });
      }

      department.updatedBy =
        req.user?._id ||
        null;

      await department.save();

      // ==================================================
      // HISTORIQUE PERSONNE 360°
      // ==================================================

      await createPersonHistory({
        req,

        memberId:
          member._id,

        type:
          "DEPARTMENT_JOINED",

        category:
          "Département",

        title:
          `Entrée dans le département ${department.name}`,

        description:
          `${member.firstName} ${member.lastName} a rejoint le département ${department.name}.`,

        occurredAt:
          joinedAt,

        newValue:
          role,

        sourceType:
          "Department",

        sourceId:
          department._id,

        metadata: {
          departmentName:
            department.name,

          role,

          responsibility:
            cleanText(
              responsibility
            ),

          note:
            cleanText(
              note
            ),

          reactivated:
            Boolean(
              existingEntry
            ),
        },

        origin:
          "automatic",
      });

      const updatedDepartment =
        await populateDepartment(
          Department.findById(
            department._id
          )
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Personne ajoutée au département avec succès.",

          data:
            updatedDepartment,
        });
    } catch (error) {
      console.error(
        "Erreur addMemberToDepartment :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors de l'ajout de la personne au département.",

          error:
            process.env
              .NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
    }
  };

// ======================================================
// MODIFIER LA RESPONSABILITÉ D'UNE PERSONNE
// PUT /api/departments/:id/members/:memberId
// ======================================================

const updateDepartmentMember =
  async (req, res) => {
    try {
      const {
        id,
        memberId,
      } = req.params;

      const {
        role,
        responsibility,
        note,
      } = req.body;

      if (
        !isValidObjectId(
          id
        ) ||
        !isValidObjectId(
          memberId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant invalide.",
          });
      }

      const [
        department,
        member,
      ] =
        await Promise.all([
          Department.findOne({
            _id: id,

            church:
              req.churchId,
          }),

          findChurchMember(
            memberId,
            req.churchId
          ),
        ]);

      if (!department) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Département introuvable.",
          });
      }

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Personne introuvable dans cette église.",
          });
      }

      const entry =
        department.members.find(
          (item) =>
            String(
              item.member
            ) ===
              String(
                memberId
              ) &&
            item.isActive !==
              false
        );

      if (!entry) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Cette personne n'est pas active dans ce département.",
          });
      }

      // ==================================================
      // VALEURS AVANT MODIFICATION
      // ==================================================

      const previousRole =
        entry.role ||
        "Membre";

      const previousResponsibility =
        entry.responsibility ||
        "";

      const previousNote =
        entry.note ||
        "";

      // ==================================================
      // NOUVELLES VALEURS
      // ==================================================

      if (
        role !== undefined
      ) {
        if (
          !MEMBER_ROLES.includes(
            role
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Le rôle sélectionné est invalide.",
            });
        }

        entry.role =
          role;
      }

      if (
        responsibility !==
        undefined
      ) {
        entry.responsibility =
          cleanText(
            responsibility
          );
      }

      if (
        note !== undefined
      ) {
        entry.note =
          cleanText(
            note
          );
      }

      const newRole =
        entry.role ||
        "Membre";

      const newResponsibility =
        entry.responsibility ||
        "";

      const newNote =
        entry.note ||
        "";

      const roleChanged =
        previousRole !==
        newRole;

      const responsibilityChanged =
        previousResponsibility !==
        newResponsibility;

      const noteChanged =
        previousNote !==
        newNote;

      department.updatedBy =
        req.user?._id ||
        null;

      await department.save();

      // ==================================================
      // HISTORIQUE PERSONNE 360°
      //
      // On ne crée une entrée que lorsqu'un changement
      // métier réel concerne le rôle ou la responsabilité.
      //
      // Une simple modification de note ne pollue pas
      // la timeline principale.
      // ==================================================

      if (
        roleChanged ||
        responsibilityChanged
      ) {
        const previousDisplay =
          [
            previousRole,
            previousResponsibility,
          ]
            .filter(Boolean)
            .join(
              " — "
            );

        const newDisplay =
          [
            newRole,
            newResponsibility,
          ]
            .filter(Boolean)
            .join(
              " — "
            );

        await createPersonHistory({
          req,

          memberId:
            member._id,

          type:
            "DEPARTMENT_RESPONSIBILITY_CHANGED",

          category:
            "Responsabilité",

          title:
            `Responsabilité modifiée dans ${department.name}`,

          description:
            `${member.firstName} ${member.lastName} a changé de responsabilité dans le département ${department.name}.`,

          occurredAt:
            new Date(),

          previousValue:
            previousDisplay,

          newValue:
            newDisplay,

          sourceType:
            "Department",

          sourceId:
            department._id,

          metadata: {
            departmentName:
              department.name,

            previousRole,

            newRole,

            previousResponsibility,

            newResponsibility,

            previousNote,

            newNote,

            roleChanged,

            responsibilityChanged,

            noteChanged,
          },

          origin:
            "automatic",
        });
      }

      const updatedDepartment =
        await populateDepartment(
          Department.findById(
            department._id
          )
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Responsabilité mise à jour avec succès.",

          data:
            updatedDepartment,
        });
    } catch (error) {
      console.error(
        "Erreur updateDepartmentMember :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors de la modification de la responsabilité.",

          error:
            process.env
              .NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
    }
  };

// ======================================================
// RETIRER UNE PERSONNE DU DÉPARTEMENT
// DELETE /api/departments/:id/members/:memberId
// ======================================================

const removeMemberFromDepartment =
  async (req, res) => {
    try {
      const {
        id,
        memberId,
      } = req.params;

      if (
        !isValidObjectId(
          id
        ) ||
        !isValidObjectId(
          memberId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant invalide.",
          });
      }

      const [
        department,
        member,
      ] =
        await Promise.all([
          Department.findOne({
            _id: id,

            church:
              req.churchId,
          }),

          findChurchMember(
            memberId,
            req.churchId
          ),
        ]);

      if (!department) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Département introuvable.",
          });
      }

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Personne introuvable dans cette église.",
          });
      }

      const entry =
        department.members.find(
          (item) =>
            String(
              item.member
            ) ===
              String(
                memberId
              ) &&
            item.isActive !==
              false
        );

      if (!entry) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Cette personne n'est pas active dans ce département.",
          });
      }

      // ==================================================
      // SNAPSHOT AVANT RETRAIT
      // ==================================================

      const previousRole =
        entry.role ||
        "Membre";

      const previousResponsibility =
        entry.responsibility ||
        "";

      const previousNote =
        entry.note ||
        "";

      const joinedAt =
        entry.joinedAt ||
        null;

      const leftAt =
        new Date();

      // ==================================================
      // RETRAIT
      // ==================================================

      entry.isActive =
        false;

      entry.leftAt =
        leftAt;

      department.updatedBy =
        req.user?._id ||
        null;

      if (
        department.leader &&
        String(
          department.leader
        ) ===
          String(
            memberId
          )
      ) {
        department.leader =
          null;
      }

      department.assistantLeaders =
        (
          department.assistantLeaders ||
          []
        ).filter(
          (assistantId) =>
            String(
              assistantId
            ) !==
            String(
              memberId
            )
        );

      await department.save();

      // ==================================================
      // HISTORIQUE PERSONNE 360°
      // ==================================================

      await createPersonHistory({
        req,

        memberId:
          member._id,

        type:
          "DEPARTMENT_LEFT",

        category:
          "Département",

        title:
          `Départ du département ${department.name}`,

        description:
          `${member.firstName} ${member.lastName} a quitté le département ${department.name}.`,

        occurredAt:
          leftAt,

        previousValue:
          [
            previousRole,
            previousResponsibility,
          ]
            .filter(Boolean)
            .join(
              " — "
            ),

        newValue:
          "Hors département",

        sourceType:
          "Department",

        sourceId:
          department._id,

        metadata: {
          departmentName:
            department.name,

          role:
            previousRole,

          responsibility:
            previousResponsibility,

          note:
            previousNote,

          joinedAt,

          leftAt,
        },

        origin:
          "automatic",
      });

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Personne retirée du département avec succès.",
        });
    } catch (error) {
      console.error(
        "Erreur removeMemberFromDepartment :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors du retrait de la personne du département.",
        });
    }
  };

// ======================================================
// SUPPRIMER UN DÉPARTEMENT
// DELETE /api/departments/:id
// ======================================================

const deleteDepartment =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Identifiant du département invalide.",
          });
      }

      const department =
        await Department.findOne({
          _id: id,

          church:
            req.churchId,
        });

      if (!department) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Département introuvable.",
          });
      }

      const activeMemberCount =
        department.members.filter(
          (entry) =>
            entry.isActive !==
            false
        ).length;

      if (
        activeMemberCount >
        0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              `Impossible de supprimer ce département : ${activeMemberCount} personne(s) y sont encore rattachée(s).`,
          });
      }

      await Department.deleteOne({
        _id:
          department._id,

        church:
          req.churchId,
      });

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Département supprimé avec succès.",
        });
    } catch (error) {
      console.error(
        "Erreur deleteDepartment :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Erreur lors de la suppression du département.",
        });
    }
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  createDepartment,
  getDepartments,
  getDepartmentStats,
  getMemberDepartments,
  getDepartmentById,
  updateDepartment,
  addMemberToDepartment,
  updateDepartmentMember,
  removeMemberFromDepartment,
  deleteDepartment,
};