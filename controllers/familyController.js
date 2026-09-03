const mongoose = require("mongoose");

const Family = require("../models/Family");
const Member = require("../models/Member");
const createPersonHistory = require("../utils/createPersonHistory");

// ======================================================
// CONSTANTES
// ======================================================

const FAMILY_RELATIONSHIPS = [
  "Père",
  "Mère",
  "Conjoint(e)",
  "Enfant",
  "Tuteur",
  "Responsable du foyer",
  "Autre",
];

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(value);
};

const escapeRegex = (value = "") => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const normalizeRelationship = (relationship) => {
  if (FAMILY_RELATIONSHIPS.includes(relationship)) {
    return relationship;
  }

  return "Autre";
};

const getChurchId = (req) => {
  return req.churchId;
};

const getMemberFullName = (member) => {
  if (!member) {
    return "Cette personne";
  }

  return [member.firstName, member.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || "Cette personne";
};

// ======================================================
// VALIDATION DES PERSONNES D'UNE ÉGLISE
// ======================================================

const validateChurchMembers = async (memberIds, churchId) => {
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return [];
  }

  const uniqueIds = [
    ...new Set(memberIds.map((id) => id.toString())),
  ];

  for (const id of uniqueIds) {
    if (!isValidObjectId(id)) {
      const error = new Error(
        "Identifiant de personne invalide."
      );

      error.status = 400;

      throw error;
    }
  }

  const members = await Member.find({
    _id: {
      $in: uniqueIds,
    },
    church: churchId,
  });

  if (members.length !== uniqueIds.length) {
    const error = new Error(
      "Une ou plusieurs personnes sont introuvables dans cette église."
    );

    error.status = 400;

    throw error;
  }

  return members;
};

// ======================================================
// POPULATE STANDARD
// ======================================================

const populateFamily = async (familyId) => {
  return Family.findById(familyId)
    .populate({
      path: "headOfHousehold",
      select:
        "firstName lastName gender birthDate ageGroup phone email membershipType status",
    })
    .populate({
      path: "members.member",
      select:
        "firstName lastName gender birthDate ageGroup phone email membershipType status family familyRole",
    });
};

// ======================================================
// CRÉER UNE FAMILLE
// ======================================================

exports.createFamily = async (req, res, next) => {
  try {
    const churchId = getChurchId(req);

    const {
      name,
      phone = "",
      address = "",
      notes = "",
      headOfHousehold = null,
      members = [],
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Le nom de la famille est obligatoire.",
      });
    }

    const normalizedMembers = Array.isArray(members)
      ? members
          .map((item) => ({
            member: item.member || item.memberId,

            relationship: normalizeRelationship(
              item.relationship
            ),
          }))
          .filter((item) => Boolean(item.member))
      : [];

    const memberIds = normalizedMembers.map((item) =>
      item.member.toString()
    );

    const uniqueIds = new Set(memberIds);

    if (uniqueIds.size !== memberIds.length) {
      return res.status(400).json({
        success: false,
        message:
          "Une personne ne peut apparaître plusieurs fois dans la même famille.",
      });
    }

    const churchMembers = await validateChurchMembers(
      memberIds,
      churchId
    );

    // ==================================================
    // PERSONNES DÉJÀ DANS UNE FAMILLE
    // ==================================================

    const alreadyAttached = churchMembers.filter(
      (member) => member.family
    );

    if (alreadyAttached.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Une ou plusieurs personnes appartiennent déjà à une famille.",

        members: alreadyAttached.map((member) => ({
          _id: member._id,
          firstName: member.firstName,
          lastName: member.lastName,
        })),
      });
    }

    // ==================================================
    // RESPONSABLE DU FOYER
    // ==================================================

    let normalizedHead = null;

    if (headOfHousehold) {
      if (!isValidObjectId(headOfHousehold)) {
        return res.status(400).json({
          success: false,
          message: "Responsable du foyer invalide.",
        });
      }

      const headExists = memberIds.includes(
        headOfHousehold.toString()
      );

      if (!headExists) {
        return res.status(400).json({
          success: false,
          message:
            "Le responsable du foyer doit faire partie de la famille.",
        });
      }

      normalizedHead = headOfHousehold;
    }

    // ==================================================
    // CRÉATION
    // ==================================================

    const family = await Family.create({
      church: churchId,

      name: name.trim(),

      phone: String(phone || "").trim(),

      address: String(address || "").trim(),

      notes: String(notes || "").trim(),

      headOfHousehold: normalizedHead,

      members: normalizedMembers,
    });

    // ==================================================
    // SYNCHRONISATION DES MEMBRES
    // ==================================================

    if (normalizedMembers.length > 0) {
      const operations = normalizedMembers.map((item) => ({
        updateOne: {
          filter: {
            _id: item.member,
            church: churchId,
          },

          update: {
            $set: {
              family: family._id,
              familyRole: item.relationship,
            },
          },
        },
      }));

      await Member.bulkWrite(operations);

      // ==================================================
      // HISTORIQUE DES PERSONNES
      // ==================================================

      const membersById = new Map(
        churchMembers.map((member) => [
          member._id.toString(),
          member,
        ])
      );

      for (const item of normalizedMembers) {
        const member = membersById.get(
          item.member.toString()
        );

        const fullName = getMemberFullName(member);

        await createPersonHistory({
          req,
          churchId,
          memberId: item.member,

          type: "FAMILY_JOINED",
          category: "Famille",

          title: `Entrée dans la famille ${family.name}`,

          description:
            `${fullName} a rejoint la famille ${family.name}.`,

          previousValue: "",
          newValue: item.relationship,

          sourceType: "Family",
          sourceId: family._id,

          metadata: {
            familyName: family.name,
            relationship: item.relationship,
            headOfHousehold:
              normalizedHead &&
              normalizedHead.toString() ===
                item.member.toString(),
            createdWithFamily: true,
          },

          origin: "automatic",
          visibility: "standard",
        });
      }
    }

    const populated = await populateFamily(family._id);

    return res.status(201).json({
      success: true,
      message: "Famille créée avec succès.",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// LISTE DES FAMILLES
// ======================================================

exports.getFamilies = async (req, res, next) => {
  try {
    const churchId = getChurchId(req);

    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        parseInt(req.query.limit, 10) || 20,
        1
      ),
      1000
    );

    const search = (req.query.search || "").trim();

    const isActive = req.query.isActive;

    const filter = {
      church: churchId,
    };

    if (isActive === "true") {
      filter.isActive = true;
    }

    if (isActive === "false") {
      filter.isActive = false;
    }

    if (search) {
      const regex = new RegExp(
        escapeRegex(search),
        "i"
      );

      filter.$or = [
        {
          name: regex,
        },
        {
          phone: regex,
        },
        {
          address: regex,
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [families, total] = await Promise.all([
      Family.find(filter)
        .sort({
          name: 1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .populate({
          path: "headOfHousehold",
          select:
            "firstName lastName gender phone email",
        })
        .populate({
          path: "members.member",
          select:
            "firstName lastName gender birthDate ageGroup phone email membershipType status",
        }),

      Family.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,

      data: families,

      pagination: {
        page,
        limit,
        total,

        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// STATISTIQUES DES FAMILLES
// ======================================================

exports.getFamilyStats = async (req, res, next) => {
  try {
    const churchId = getChurchId(req);

    const families = await Family.find({
      church: churchId,
      isActive: true,
    }).select("members headOfHousehold");

    const totalFamilies = families.length;

    const totalPeopleInFamilies = families.reduce(
      (total, family) =>
        total + family.members.length,
      0
    );

    const averageFamilySize =
      totalFamilies > 0
        ? Number(
            (
              totalPeopleInFamilies /
              totalFamilies
            ).toFixed(1)
          )
        : 0;

    const familiesWithHead = families.filter(
      (family) => Boolean(family.headOfHousehold)
    ).length;

    const membersWithoutFamily =
      await Member.countDocuments({
        church: churchId,
        family: null,
      });

    return res.status(200).json({
      success: true,

      data: {
        totalFamilies,
        totalPeopleInFamilies,
        averageFamilySize,
        familiesWithHead,
        membersWithoutFamily,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// TROUVER LA FAMILLE D'UNE PERSONNE
// ======================================================

exports.getFamilyByMember = async (req, res, next) => {
  try {
    const churchId = getChurchId(req);

    const { memberId } = req.params;

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant de personne invalide.",
      });
    }

    const member = await Member.findOne({
      _id: memberId,
      church: churchId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Personne introuvable.",
      });
    }

    if (!member.family) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    const family = await Family.findOne({
      _id: member.family,
      church: churchId,
    })
      .populate({
        path: "headOfHousehold",
        select:
          "firstName lastName gender birthDate ageGroup phone email membershipType status",
      })
      .populate({
        path: "members.member",
        select:
          "firstName lastName gender birthDate ageGroup phone email membershipType status familyRole",
      });

    return res.status(200).json({
      success: true,
      data: family || null,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// DÉTAIL D'UNE FAMILLE
// ======================================================

exports.getFamilyById = async (req, res, next) => {
  try {
    const churchId = getChurchId(req);

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant de famille invalide.",
      });
    }

    const family = await Family.findOne({
      _id: id,
      church: churchId,
    })
      .populate({
        path: "headOfHousehold",
        select:
          "firstName lastName gender birthDate ageGroup phone email membershipType status",
      })
      .populate({
        path: "members.member",
        select:
          "firstName lastName gender birthDate ageGroup phone email membershipType status family familyRole",
      });

    if (!family) {
      return res.status(404).json({
        success: false,
        message: "Famille introuvable.",
      });
    }

    return res.status(200).json({
      success: true,
      data: family,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// MODIFIER LES INFORMATIONS D'UNE FAMILLE
// ======================================================

exports.updateFamily = async (req, res, next) => {
  try {
    const churchId = getChurchId(req);

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant de famille invalide.",
      });
    }

    const family = await Family.findOne({
      _id: id,
      church: churchId,
    });

    if (!family) {
      return res.status(404).json({
        success: false,
        message: "Famille introuvable.",
      });
    }

    const {
      name,
      phone,
      address,
      notes,
      isActive,
      headOfHousehold,
    } = req.body;

    if (typeof name !== "undefined") {
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Le nom de la famille ne peut pas être vide.",
        });
      }

      family.name = name.trim();
    }

    if (typeof phone !== "undefined") {
      family.phone = String(phone || "").trim();
    }

    if (typeof address !== "undefined") {
      family.address = String(
        address || ""
      ).trim();
    }

    if (typeof notes !== "undefined") {
      family.notes = String(notes || "").trim();
    }

    if (typeof isActive === "boolean") {
      family.isActive = isActive;
    }

    // ==================================================
    // RESPONSABLE DU FOYER
    // ==================================================

    if (typeof headOfHousehold !== "undefined") {
      if (
        headOfHousehold === null ||
        headOfHousehold === ""
      ) {
        family.headOfHousehold = null;
      } else {
        if (!isValidObjectId(headOfHousehold)) {
          return res.status(400).json({
            success: false,
            message:
              "Responsable du foyer invalide.",
          });
        }

        const belongsToFamily =
          family.members.some(
            (item) =>
              item.member.toString() ===
              headOfHousehold.toString()
          );

        if (!belongsToFamily) {
          return res.status(400).json({
            success: false,
            message:
              "Le responsable du foyer doit appartenir à cette famille.",
          });
        }

        family.headOfHousehold =
          headOfHousehold;
      }
    }

    await family.save();

    const populated = await populateFamily(
      family._id
    );

    return res.status(200).json({
      success: true,
      message: "Famille modifiée avec succès.",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// AJOUTER UNE PERSONNE À UNE FAMILLE
// ======================================================

exports.addFamilyMember = async (req, res, next) => {
  try {
    const churchId = getChurchId(req);

    const { id } = req.params;

    const {
      memberId,
      relationship = "Autre",
    } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant de famille invalide.",
      });
    }

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant de personne invalide.",
      });
    }

    const family = await Family.findOne({
      _id: id,
      church: churchId,
    });

    if (!family) {
      return res.status(404).json({
        success: false,
        message: "Famille introuvable.",
      });
    }

    const member = await Member.findOne({
      _id: memberId,
      church: churchId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message:
          "Personne introuvable dans cette église.",
      });
    }

    const alreadyInFamily = family.members.some(
      (item) =>
        item.member.toString() ===
        memberId.toString()
    );

    if (alreadyInFamily) {
      return res.status(409).json({
        success: false,
        message:
          "Cette personne fait déjà partie de cette famille.",
      });
    }

    if (
      member.family &&
      member.family.toString() !==
        family._id.toString()
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Cette personne appartient déjà à une autre famille.",
      });
    }

    const finalRelationship =
      normalizeRelationship(relationship);

    const joinedAt = new Date();

    family.members.push({
      member: member._id,
      relationship: finalRelationship,
      joinedAt,
    });

    await family.save();

    member.family = family._id;
    member.familyRole = finalRelationship;

    await member.save();

    // ==================================================
    // HISTORIQUE PERSONNE
    // ==================================================

    const fullName = getMemberFullName(member);

    await createPersonHistory({
      req,
      churchId,
      memberId: member._id,

      type: "FAMILY_JOINED",
      category: "Famille",

      title: `Entrée dans la famille ${family.name}`,

      description:
        `${fullName} a rejoint la famille ${family.name}.`,

      previousValue: "",
      newValue: finalRelationship,

      sourceType: "Family",
      sourceId: family._id,

      occurredAt: joinedAt,

      metadata: {
        familyName: family.name,
        relationship: finalRelationship,
        joinedAt,
        createdWithFamily: false,
      },

      origin: "automatic",
      visibility: "standard",
    });

    const populated = await populateFamily(
      family._id
    );

    return res.status(200).json({
      success: true,
      message:
        "Personne ajoutée à la famille.",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// MODIFIER LE RÔLE FAMILIAL D'UNE PERSONNE
// ======================================================

exports.updateFamilyMember = async (
  req,
  res,
  next
) => {
  try {
    const churchId = getChurchId(req);

    const { id, memberId } = req.params;

    const { relationship } = req.body;

    if (
      !isValidObjectId(id) ||
      !isValidObjectId(memberId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Identifiant invalide.",
      });
    }

    if (
      !FAMILY_RELATIONSHIPS.includes(
        relationship
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Relation familiale invalide.",
      });
    }

    const family = await Family.findOne({
      _id: id,
      church: churchId,
    });

    if (!family) {
      return res.status(404).json({
        success: false,
        message: "Famille introuvable.",
      });
    }

    const familyMember = family.members.find(
      (item) =>
        item.member.toString() ===
        memberId.toString()
    );

    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message:
          "Cette personne ne fait pas partie de cette famille.",
      });
    }

    const previousRelationship =
      familyMember.relationship || "Autre";

    const relationshipChanged =
      previousRelationship !== relationship;

    // Si rien ne change, on ne pollue pas l'historique.
    if (!relationshipChanged) {
      const populated = await populateFamily(
        family._id
      );

      return res.status(200).json({
        success: true,
        message:
          "Relation familiale inchangée.",
        data: populated,
      });
    }

    const member = await Member.findOne({
      _id: memberId,
      church: churchId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Personne introuvable.",
      });
    }

    familyMember.relationship = relationship;

    await family.save();

    member.family = family._id;
    member.familyRole = relationship;

    await member.save();

    // ==================================================
    // HISTORIQUE PERSONNE
    // ==================================================

    const fullName = getMemberFullName(member);

    await createPersonHistory({
      req,
      churchId,
      memberId: member._id,

      type: "FAMILY_ROLE_CHANGED",
      category: "Famille",

      title: `Rôle familial modifié dans ${family.name}`,

      description:
        `${fullName} a changé de rôle dans la famille ${family.name}.`,

      previousValue: previousRelationship,
      newValue: relationship,

      sourceType: "Family",
      sourceId: family._id,

      metadata: {
        familyName: family.name,
        previousRelationship,
        newRelationship: relationship,
      },

      origin: "automatic",
      visibility: "standard",
    });

    const populated = await populateFamily(
      family._id
    );

    return res.status(200).json({
      success: true,
      message:
        "Relation familiale modifiée.",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// RETIRER UNE PERSONNE D'UNE FAMILLE
// ======================================================

exports.removeFamilyMember = async (
  req,
  res,
  next
) => {
  try {
    const churchId = getChurchId(req);

    const { id, memberId } = req.params;

    if (
      !isValidObjectId(id) ||
      !isValidObjectId(memberId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Identifiant invalide.",
      });
    }

    const family = await Family.findOne({
      _id: id,
      church: churchId,
    });

    if (!family) {
      return res.status(404).json({
        success: false,
        message: "Famille introuvable.",
      });
    }

    const familyMember = family.members.find(
      (item) =>
        item.member.toString() ===
        memberId.toString()
    );

    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message:
          "Cette personne ne fait pas partie de cette famille.",
      });
    }

    const member = await Member.findOne({
      _id: memberId,
      church: churchId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Personne introuvable.",
      });
    }

    const previousRelationship =
      familyMember.relationship || "Autre";

    const joinedAt =
      familyMember.joinedAt || null;

    const leftAt = new Date();

    family.members = family.members.filter(
      (item) =>
        item.member.toString() !==
        memberId.toString()
    );

    const wasHeadOfHousehold =
      Boolean(family.headOfHousehold) &&
      family.headOfHousehold.toString() ===
        memberId.toString();

    if (wasHeadOfHousehold) {
      family.headOfHousehold = null;
    }

    await family.save();

    member.family = null;
    member.familyRole = "";

    await member.save();

    // ==================================================
    // HISTORIQUE PERSONNE
    // ==================================================

    const fullName = getMemberFullName(member);

    await createPersonHistory({
      req,
      churchId,
      memberId: member._id,

      type: "FAMILY_LEFT",
      category: "Famille",

      title: `Sortie de la famille ${family.name}`,

      description:
        `${fullName} a quitté la famille ${family.name}.`,

      previousValue: previousRelationship,
      newValue: "Hors famille",

      sourceType: "Family",
      sourceId: family._id,

      occurredAt: leftAt,

      metadata: {
        familyName: family.name,
        relationship: previousRelationship,
        joinedAt,
        leftAt,
        wasHeadOfHousehold,
      },

      origin: "automatic",
      visibility: "standard",
    });

    const populated = await populateFamily(
      family._id
    );

    return res.status(200).json({
      success: true,
      message:
        "Personne retirée de la famille.",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// SUPPRIMER UNE FAMILLE
// ======================================================

exports.deleteFamily = async (req, res, next) => {
  try {
    const churchId = getChurchId(req);

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant de famille invalide.",
      });
    }

    const family = await Family.findOne({
      _id: id,
      church: churchId,
    });

    if (!family) {
      return res.status(404).json({
        success: false,
        message: "Famille introuvable.",
      });
    }

    // ==================================================
    // SNAPSHOT AVANT SUPPRESSION
    // ==================================================

    const memberSnapshots = family.members.map(
      (item) => ({
        memberId: item.member,
        relationship:
          item.relationship || "Autre",
        joinedAt: item.joinedAt || null,
      })
    );

    const memberIds = memberSnapshots.map(
      (item) => item.memberId
    );

    const existingMembers =
      memberIds.length > 0
        ? await Member.find({
            _id: {
              $in: memberIds,
            },
            church: churchId,
          })
        : [];

    const membersById = new Map(
      existingMembers.map((member) => [
        member._id.toString(),
        member,
      ])
    );

    const deletedAt = new Date();

    // ==================================================
    // DÉTACHER LES PERSONNES
    // ==================================================

    await Member.updateMany(
      {
        church: churchId,
        family: family._id,
      },
      {
        $set: {
          family: null,
          familyRole: "",
        },
      }
    );

    // ==================================================
    // HISTORIQUE AVANT SUPPRESSION DÉFINITIVE
    // ==================================================

    for (const snapshot of memberSnapshots) {
      const member = membersById.get(
        snapshot.memberId.toString()
      );

      const fullName =
        getMemberFullName(member);

      await createPersonHistory({
        req,
        churchId,
        memberId: snapshot.memberId,

        type: "FAMILY_LEFT",
        category: "Famille",

        title: `Sortie de la famille ${family.name}`,

        description:
          `${fullName} a quitté la famille ${family.name} à la suite de la suppression de cette famille.`,

        previousValue:
          snapshot.relationship,

        newValue: "Hors famille",

        sourceType: "Family",
        sourceId: family._id,

        occurredAt: deletedAt,

        metadata: {
          familyName: family.name,
          relationship:
            snapshot.relationship,
          joinedAt:
            snapshot.joinedAt,
          leftAt: deletedAt,
          familyDeleted: true,
        },

        origin: "automatic",
        visibility: "standard",
      });
    }

    await family.deleteOne();

    return res.status(200).json({
      success: true,
      message:
        "Famille supprimée avec succès.",
    });
  } catch (error) {
    next(error);
  }
};