const mongoose =
  require("mongoose");

const Group =
  require("../models/Group");

const Member =
  require("../models/Member");

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (
  value
) =>
  mongoose.Types.ObjectId.isValid(
    value
  );

const normalizeText = (
  value
) =>
  typeof value === "string"
    ? value.trim()
    : value;

const escapeRegex = (
  value = ""
) =>
  value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

// ======================================================
// VÉRIFIER UNE PERSONNE DANS L'ÉGLISE
// ======================================================

const findChurchMember =
  async (
    memberId,
    churchId
  ) => {
    if (
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
// CRÉER UN GROUPE
// POST /api/groups
// ======================================================

const createGroup =
  async (req, res) => {
    try {
      const churchId =
        req.churchId;

      const {
        name,
        type,
        description,
        status,
        leader,
        assistantLeaders,
        meetingDay,
        meetingTime,
        meetingFrequency,
        location,
        address,
        city,
        capacity,
        startedAt,
        notes,
      } = req.body;

      if (
        !name ||
        !name.trim()
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Le nom du groupe est obligatoire.",
          });
      }

      // ==================================================
      // RESPONSABLE
      // ==================================================

      let validLeader =
        null;

      if (leader) {
        const member =
          await findChurchMember(
            leader,
            churchId
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

      // ==================================================
      // ASSISTANTS
      // ==================================================

      let validAssistants =
        [];

      if (
        Array.isArray(
          assistantLeaders
        ) &&
        assistantLeaders.length >
          0
      ) {
        const uniqueIds = [
          ...new Set(
            assistantLeaders.map(
              String
            )
          ),
        ];

        for (
          const assistantId
          of uniqueIds
        ) {
          const assistant =
            await findChurchMember(
              assistantId,
              churchId
            );

          if (!assistant) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Un assistant sélectionné n'appartient pas à cette église.",
              });
          }

          if (
            validLeader &&
            assistantId ===
              validLeader.toString()
          ) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Le responsable principal ne peut pas également être assistant.",
              });
          }

          validAssistants.push(
            assistant._id
          );
        }
      }

      // ==================================================
      // CRÉATION
      // ==================================================

      const group =
        await Group.create({
          church: churchId,

          name:
            normalizeText(
              name
            ),

          type:
            type ||
            "Cellule",

          description:
            normalizeText(
              description
            ) || "",

          status:
            status ||
            "Actif",

          leader:
            validLeader,

          assistantLeaders:
            validAssistants,

          meetingDay:
            normalizeText(
              meetingDay
            ) || "",

          meetingTime:
            normalizeText(
              meetingTime
            ) || "",

          meetingFrequency:
            meetingFrequency ||
            "Hebdomadaire",

          location:
            normalizeText(
              location
            ) || "",

          address:
            normalizeText(
              address
            ) || "",

          city:
            normalizeText(
              city
            ) || "",

          capacity:
            Number(capacity) ||
            0,

          startedAt:
            startedAt ||
            null,

          notes:
            normalizeText(
              notes
            ) || "",

          createdBy:
            req.user?._id ||
            null,

          updatedBy:
            req.user?._id ||
            null,
        });

      const populated =
        await Group.findById(
          group._id
        )
          .populate(
            "leader",
            "firstName lastName phone email"
          )
          .populate(
            "assistantLeaders",
            "firstName lastName phone email"
          );

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Groupe créé avec succès.",
          data: populated,
        });
    } catch (error) {
      console.error(
        "Erreur createGroup :",
        error
      );

      if (
        error.code ===
        11000
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Un groupe portant ce nom existe déjà dans cette église.",
          });
      }

      return res
        .status(500)
        .json({
          success: false,
          message:
            error.message ||
            "Impossible de créer le groupe.",
        });
    }
  };

// ======================================================
// LISTE DES GROUPES
// GET /api/groups
// ======================================================

const getGroups =
  async (req, res) => {
    try {
      const {
        search = "",
        type = "",
        status = "",
        page = 1,
        limit = 20,
      } = req.query;

      const query = {
        church:
          req.churchId,
      };

      if (type) {
        query.type =
          type;
      }

      if (status) {
        query.status =
          status;
      }

      if (
        search.trim()
      ) {
        const regex =
          new RegExp(
            escapeRegex(
              search.trim()
            ),
            "i"
          );

        query.$or = [
          {
            name: regex,
          },
          {
            description:
              regex,
          },
          {
            location:
              regex,
          },
          {
            city: regex,
          },
        ];
      }

      const currentPage =
        Math.max(
          Number(page) || 1,
          1
        );

      const currentLimit =
        Math.min(
          Math.max(
            Number(limit) ||
              20,
            1
          ),
          100
        );

      const skip =
        (currentPage - 1) *
        currentLimit;

      const [
        groups,
        total,
      ] =
        await Promise.all([
          Group.find(query)
            .populate(
              "leader",
              "firstName lastName phone email"
            )
            .populate(
              "assistantLeaders",
              "firstName lastName"
            )
            .populate(
              "members.member",
              "firstName lastName phone email status membershipType"
            )
            .sort({
              createdAt: -1,
            })
            .skip(skip)
            .limit(
              currentLimit
            ),

          Group.countDocuments(
            query
          ),
        ]);

      const enriched =
        groups.map(
          (group) => {
            const data =
              group.toObject();

            const activeMembers =
              data.members.filter(
                (item) =>
                  item.isActive !==
                  false
              );

            return {
              ...data,

              memberCount:
                activeMembers.length,

              isFull:
                data.capacity >
                  0 &&
                activeMembers.length >=
                  data.capacity,
            };
          }
        );

      return res.json({
        success: true,

        data: enriched,

        pagination: {
          page:
            currentPage,

          limit:
            currentLimit,

          total,

          pages:
            Math.ceil(
              total /
                currentLimit
            ),
        },
      });
    } catch (error) {
      console.error(
        "Erreur getGroups :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Impossible de charger les groupes.",
        });
    }
  };

// ======================================================
// DÉTAIL D'UN GROUPE
// GET /api/groups/:id
// ======================================================

const getGroupById =
  async (req, res) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Identifiant du groupe invalide.",
          });
      }

      const group =
        await Group.findOne({
          _id: req.params.id,
          church:
            req.churchId,
        })
          .populate(
            "leader",
            "firstName lastName phone email status membershipType"
          )
          .populate(
            "assistantLeaders",
            "firstName lastName phone email"
          )
          .populate(
            "members.member",
            "firstName lastName phone email gender birthDate ageGroup status membershipType spiritualStage"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .populate(
            "updatedBy",
            "name email"
          );

      if (!group) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Groupe introuvable.",
          });
      }

      const data =
        group.toObject();

      const activeMembers =
        data.members.filter(
          (item) =>
            item.isActive !==
            false
        );

      return res.json({
        success: true,

        data: {
          ...data,

          memberCount:
            activeMembers.length,

          isFull:
            data.capacity > 0 &&
            activeMembers.length >=
              data.capacity,
        },
      });
    } catch (error) {
      console.error(
        "Erreur getGroupById :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Impossible de charger le groupe.",
        });
    }
  };

// ======================================================
// MODIFIER UN GROUPE
// PUT /api/groups/:id
// ======================================================

const updateGroup =
  async (req, res) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Identifiant du groupe invalide.",
          });
      }

      const group =
        await Group.findOne({
          _id: req.params.id,
          church:
            req.churchId,
        });

      if (!group) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Groupe introuvable.",
          });
      }

      const allowedFields = [
        "name",
        "type",
        "description",
        "status",
        "meetingDay",
        "meetingTime",
        "meetingFrequency",
        "location",
        "address",
        "city",
        "capacity",
        "startedAt",
        "notes",
      ];

      allowedFields.forEach(
        (field) => {
          if (
            Object.prototype.hasOwnProperty.call(
              req.body,
              field
            )
          ) {
            group[field] =
              typeof req.body[
                field
              ] === "string"
                ? req.body[
                    field
                  ].trim()
                : req.body[
                    field
                  ];
          }
        }
      );

      // ==================================================
      // RESPONSABLE
      // ==================================================

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "leader"
        )
      ) {
        if (
          !req.body.leader
        ) {
          group.leader =
            null;
        } else {
          const leader =
            await findChurchMember(
              req.body
                .leader,
              req.churchId
            );

          if (!leader) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Le responsable sélectionné n'appartient pas à cette église.",
              });
          }

          group.leader =
            leader._id;
        }
      }

      // ==================================================
      // ASSISTANTS
      // ==================================================

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "assistantLeaders"
        )
      ) {
        if (
          !Array.isArray(
            req.body
              .assistantLeaders
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "La liste des assistants est invalide.",
            });
        }

        const uniqueIds = [
          ...new Set(
            req.body
              .assistantLeaders
              .map(String)
          ),
        ];

        const assistants =
          [];

        for (
          const assistantId
          of uniqueIds
        ) {
          const assistant =
            await findChurchMember(
              assistantId,
              req.churchId
            );

          if (!assistant) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Un assistant sélectionné n'appartient pas à cette église.",
              });
          }

          if (
            group.leader &&
            assistantId ===
              group.leader.toString()
          ) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  "Le responsable principal ne peut pas également être assistant.",
              });
          }

          assistants.push(
            assistant._id
          );
        }

        group.assistantLeaders =
          assistants;
      }

      group.updatedBy =
        req.user?._id ||
        null;

      await group.save();

      const populated =
        await Group.findById(
          group._id
        )
          .populate(
            "leader",
            "firstName lastName phone email"
          )
          .populate(
            "assistantLeaders",
            "firstName lastName phone email"
          )
          .populate(
            "members.member",
            "firstName lastName phone email status membershipType"
          );

      return res.json({
        success: true,

        message:
          "Groupe mis à jour avec succès.",

        data: populated,
      });
    } catch (error) {
      console.error(
        "Erreur updateGroup :",
        error
      );

      if (
        error.code ===
        11000
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Un autre groupe porte déjà ce nom.",
          });
      }

      return res
        .status(500)
        .json({
          success: false,
          message:
            error.message ||
            "Impossible de modifier le groupe.",
        });
    }
  };

// ======================================================
// SUPPRIMER UN GROUPE
// DELETE /api/groups/:id
// ======================================================

const deleteGroup =
  async (req, res) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Identifiant du groupe invalide.",
          });
      }

      const group =
        await Group.findOneAndDelete(
          {
            _id:
              req.params.id,

            church:
              req.churchId,
          }
        );

      if (!group) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Groupe introuvable.",
          });
      }

      return res.json({
        success: true,

        message:
          "Groupe supprimé avec succès.",
      });
    } catch (error) {
      console.error(
        "Erreur deleteGroup :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Impossible de supprimer le groupe.",
        });
    }
  };

// ======================================================
// AJOUTER UNE PERSONNE AU GROUPE
// POST /api/groups/:id/members
// ======================================================

const addMemberToGroup =
  async (req, res) => {
    try {
      const {
        memberId,
        role = "Membre",
        note = "",
      } = req.body;

      const group =
        await Group.findOne({
          _id: req.params.id,
          church:
            req.churchId,
        });

      if (!group) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Groupe introuvable.",
          });
      }

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
              "Cette personne n'appartient pas à cette église.",
          });
      }

      const existing =
        group.members.find(
          (item) =>
            item.member.toString() ===
            member._id.toString()
        );

      if (existing) {
        if (
          existing.isActive ===
          false
        ) {
          existing.isActive =
            true;

          existing.role =
            role;

          existing.joinedAt =
            new Date();

          existing.note =
            note.trim();

          group.updatedBy =
            req.user?._id ||
            null;

          await group.save();

          return res.json({
            success: true,
            message:
              "La personne a été réintégrée dans le groupe.",
          });
        }

        return res
          .status(409)
          .json({
            success: false,
            message:
              "Cette personne appartient déjà à ce groupe.",
          });
      }

      const activeCount =
        group.members.filter(
          (item) =>
            item.isActive !==
            false
        ).length;

      if (
        group.capacity > 0 &&
        activeCount >=
          group.capacity
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "La capacité maximale de ce groupe est atteinte.",
          });
      }

      group.members.push({
        member:
          member._id,

        role,

        note:
          note.trim(),

        joinedAt:
          new Date(),

        isActive: true,
      });

      group.updatedBy =
        req.user?._id ||
        null;

      await group.save();

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Personne ajoutée au groupe avec succès.",
        });
    } catch (error) {
      console.error(
        "Erreur addMemberToGroup :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            error.message ||
            "Impossible d'ajouter la personne au groupe.",
        });
    }
  };

// ======================================================
// MODIFIER LE RÔLE D'UNE PERSONNE
// PUT /api/groups/:id/members/:memberId
// ======================================================

const updateGroupMember =
  async (req, res) => {
    try {
      const group =
        await Group.findOne({
          _id: req.params.id,
          church:
            req.churchId,
        });

      if (!group) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Groupe introuvable.",
          });
      }

      const entry =
        group.members.find(
          (item) =>
            item.member.toString() ===
            req.params.memberId
        );

      if (!entry) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Cette personne n'appartient pas à ce groupe.",
          });
      }

      if (
        req.body.role
      ) {
        entry.role =
          req.body.role;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "note"
        )
      ) {
        entry.note =
          normalizeText(
            req.body.note
          ) || "";
      }

      if (
        typeof req.body
          .isActive ===
        "boolean"
      ) {
        entry.isActive =
          req.body.isActive;
      }

      group.updatedBy =
        req.user?._id ||
        null;

      await group.save();

      return res.json({
        success: true,

        message:
          "Participation au groupe mise à jour.",
      });
    } catch (error) {
      console.error(
        "Erreur updateGroupMember :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            error.message ||
            "Impossible de modifier la participation.",
        });
    }
  };

// ======================================================
// RETIRER UNE PERSONNE DU GROUPE
// DELETE /api/groups/:id/members/:memberId
// ======================================================

const removeMemberFromGroup =
  async (req, res) => {
    try {
      const group =
        await Group.findOne({
          _id: req.params.id,
          church:
            req.churchId,
        });

      if (!group) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Groupe introuvable.",
          });
      }

      const entry =
        group.members.find(
          (item) =>
            item.member.toString() ===
            req.params.memberId
        );

      if (!entry) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Cette personne n'appartient pas à ce groupe.",
          });
      }

      // On conserve l'historique
      entry.isActive =
        false;

      group.updatedBy =
        req.user?._id ||
        null;

      await group.save();

      return res.json({
        success: true,

        message:
          "La personne a été retirée du groupe.",
      });
    } catch (error) {
      console.error(
        "Erreur removeMemberFromGroup :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Impossible de retirer la personne du groupe.",
        });
    }
  };

// ======================================================
// GROUPES D'UNE PERSONNE
// GET /api/groups/member/:memberId
// ======================================================

const getMemberGroups =
  async (req, res) => {
    try {
      const member =
        await findChurchMember(
          req.params.memberId,
          req.churchId
        );

      if (!member) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Personne introuvable.",
          });
      }

      const groups =
        await Group.find({
          church:
            req.churchId,

          members: {
            $elemMatch: {
              member:
                member._id,

              isActive: {
                $ne: false,
              },
            },
          },
        })
          .populate(
            "leader",
            "firstName lastName phone email"
          )
          .sort({
            name: 1,
          });

      return res.json({
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

          groups,
        },
      });
    } catch (error) {
      console.error(
        "Erreur getMemberGroups :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Impossible de charger les groupes de cette personne.",
        });
    }
  };

// ======================================================
// STATISTIQUES
// GET /api/groups/stats
// ======================================================

const getGroupStats =
  async (req, res) => {
    try {
      const churchId =
        req.churchId;

      const [
        groups,
        totalMembers,
      ] =
        await Promise.all([
          Group.find({
            church:
              churchId,
          }).select(
            "status type capacity members"
          ),

          Member.countDocuments({
            church:
              churchId,

            membershipType: {
              $ne: "Visiteur",
            },

            status: "Actif",
          }),
        ]);

      const activeGroups =
        groups.filter(
          (group) =>
            group.status ===
            "Actif"
        );

      const activeMemberIds =
        new Set();

      let totalMemberships =
        0;

      activeGroups.forEach(
        (group) => {
          group.members.forEach(
            (item) => {
              if (
                item.isActive ===
                false
              ) {
                return;
              }

              totalMemberships +=
                1;

              activeMemberIds.add(
                item.member.toString()
              );
            }
          );
        }
      );

      const membersInGroups =
        activeMemberIds.size;

      const membersWithoutGroup =
        Math.max(
          totalMembers -
            membersInGroups,
          0
        );

      const averageGroupSize =
        activeGroups.length >
        0
          ? Number(
              (
                totalMemberships /
                activeGroups.length
              ).toFixed(1)
            )
          : 0;

      const groupsByType =
        {};

      groups.forEach(
        (group) => {
          groupsByType[
            group.type
          ] =
            (
              groupsByType[
                group.type
              ] || 0
            ) + 1;
        }
      );

      return res.json({
        success: true,

        data: {
          totalGroups:
            groups.length,

          activeGroups:
            activeGroups.length,

          inactiveGroups:
            groups.filter(
              (group) =>
                group.status ===
                "Inactif"
            ).length,

          pausedGroups:
            groups.filter(
              (group) =>
                group.status ===
                "En pause"
            ).length,

          totalMembers,

          membersInGroups,

          membersWithoutGroup,

          averageGroupSize,

          coverageRate:
            totalMembers > 0
              ? Number(
                  (
                    (
                      membersInGroups /
                      totalMembers
                    ) *
                    100
                  ).toFixed(1)
                )
              : 0,

          groupsByType,
        },
      });
    } catch (error) {
      console.error(
        "Erreur getGroupStats :",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Impossible de calculer les statistiques des groupes.",
        });
    }
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  createGroup,
  getGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  addMemberToGroup,
  updateGroupMember,
  removeMemberFromGroup,
  getMemberGroups,
  getGroupStats,
};