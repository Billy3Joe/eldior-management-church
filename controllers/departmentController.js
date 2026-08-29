const mongoose = require("mongoose");

const Department = require("../models/Department");
const Member = require("../models/Member");

// ======================================================
// CRÉER UN DÉPARTEMENT
// POST /api/departments
// ======================================================

const createDepartment = async (req, res) => {
  try {
    const {
      name,
      leader,
      status,
      description,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Le nom du département est obligatoire",
      });
    }

    // Vérifier si le département existe déjà
    // dans la même église
    const existingDepartment =
      await Department.findOne({
        church: req.churchId,
        name: {
          $regex: new RegExp(
            `^${name.trim()}$`,
            "i"
          ),
        },
      });

    if (existingDepartment) {
      return res.status(400).json({
        success: false,
        message:
          "Un département avec ce nom existe déjà",
      });
    }

    const department =
      await Department.create({
        church: req.churchId,

        name: name.trim(),

        leader:
          typeof leader === "string"
            ? leader.trim()
            : leader || "",

        description:
          typeof description === "string"
            ? description.trim()
            : description || "",

        status:
          status || "active",
      });

    return res.status(201).json({
      success: true,
      message:
        "Département créé avec succès",
      data: department,
    });
  } catch (error) {
    console.error(
      "Erreur createDepartment :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Erreur lors de la création du département",
      error:
        process.env.NODE_ENV ===
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

const getDepartments = async (
  req,
  res
) => {
  try {
    const {
      search = "",
      status = "",
      page = 1,
      limit = 20,
    } = req.query;

    const numericPage =
      Math.max(
        parseInt(page, 10) || 1,
        1
      );

    const numericLimit =
      Math.min(
        Math.max(
          parseInt(limit, 10) || 20,
          1
        ),
        1000
      );

    const filter = {
      church: req.churchId,
    };

    // Recherche
    if (search.trim()) {
      filter.$or = [
        {
          name: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          leader: {
            $regex: search.trim(),
            $options: "i",
          },
        },
      ];
    }

    // Filtre statut
    if (status) {
      filter.status = status;
    }

    const skip =
      (numericPage - 1) *
      numericLimit;

    const [
      departments,
      total,
    ] = await Promise.all([
      Department.find(filter)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(numericLimit)
        .lean(),

      Department.countDocuments(
        filter
      ),
    ]);

    const totalPages =
      Math.max(
        Math.ceil(
          total / numericLimit
        ),
        1
      );

    return res.status(200).json({
      success: true,

      data: departments,

      // Compatibilité frontend
      departments,

      page: numericPage,

      limit: numericLimit,

      total,

      totalPages,
    });
  } catch (error) {
    console.error(
      "Erreur getDepartments :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Erreur lors du chargement des départements",
      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};

// ======================================================
// STATISTIQUES DE TOUS LES DÉPARTEMENTS
// GET /api/departments/stats/all
// ======================================================

const getDepartmentStats = async (
  req,
  res
) => {
  try {
    const churchId =
      new mongoose.Types.ObjectId(
        req.churchId
      );

    // Tous les départements de l'église
    const departments =
      await Department.find({
        church: req.churchId,
      })
        .sort({
          name: 1,
        })
        .lean();

    // Statistiques des membres groupées
    // par département
    const memberStats =
      await Member.aggregate([
        {
          $match: {
            church: churchId,

            department: {
              $ne: null,
            },
          },
        },

        {
          $group: {
            _id: "$department",

            totalMembers: {
              $sum: 1,
            },

            activeMembers: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "active",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            inactiveMembers: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "inactive",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

    // Transformer les statistiques
    // en Map pour les retrouver rapidement
    const statsMap = new Map();

    memberStats.forEach(
      (item) => {
        statsMap.set(
          item._id?.toString(),
          {
            totalMembers:
              item.totalMembers || 0,

            activeMembers:
              item.activeMembers || 0,

            inactiveMembers:
              item.inactiveMembers ||
              0,
          }
        );
      }
    );

    // Fusion départements + statistiques
    const data =
      departments.map(
        (department) => {
          const departmentStats =
            statsMap.get(
              department._id.toString()
            ) || {
              totalMembers: 0,
              activeMembers: 0,
              inactiveMembers: 0,
            };

          return {
            _id:
              department._id,

            name:
              department.name,

            leader:
              department.leader ||
              "",

            status:
              department.status ||
              "active",

            totalMembers:
              departmentStats.totalMembers,

            activeMembers:
              departmentStats.activeMembers,

            inactiveMembers:
              departmentStats.inactiveMembers,
          };
        }
      );

    // ==================================================
    // RÉSUMÉ
    // ==================================================

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

    const totalMembers =
      data.reduce(
        (total, department) =>
          total +
          department.totalMembers,
        0
      );

    const activeMembers =
      data.reduce(
        (total, department) =>
          total +
          department.activeMembers,
        0
      );

    const inactiveMembers =
      data.reduce(
        (total, department) =>
          total +
          department.inactiveMembers,
        0
      );

    return res.status(200).json({
      success: true,

      data,

      // Compatibilité supplémentaire
      departments: data,

      summary: {
        totalDepartments,

        activeDepartments,

        inactiveDepartments,

        totalMembers,

        activeMembers,

        inactiveMembers,
      },
    });
  } catch (error) {
    console.error(
      "Erreur getDepartmentStats :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Erreur lors du chargement des statistiques des départements",
      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
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
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Identifiant du département invalide",
          });
      }

      const department =
        await Department.findOne({
          _id: id,
          church:
            req.churchId,
        }).lean();

      if (!department) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Département introuvable",
          });
      }

      const memberCount =
        await Member.countDocuments({
          church:
            req.churchId,

          department:
            department._id,
        });

      return res
        .status(200)
        .json({
          success: true,

          data: {
            ...department,

            totalMembers:
              memberCount,
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
            "Erreur lors du chargement du département",
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
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Identifiant du département invalide",
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
              "Département introuvable",
          });
      }

      const {
        name,
        leader,
        status,
        description,
      } = req.body;

      // Vérification nom déjà utilisé
      if (
        name &&
        name.trim() !==
          department.name
      ) {
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
                  `^${name.trim()}$`,
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
                "Un département avec ce nom existe déjà",
            });
        }
      }

      if (name !== undefined) {
        department.name =
          name.trim();
      }

      if (leader !== undefined) {
        department.leader =
          typeof leader ===
          "string"
            ? leader.trim()
            : leader;
      }

      if (
        description !==
        undefined
      ) {
        department.description =
          typeof description ===
          "string"
            ? description.trim()
            : description;
      }

      if (status !== undefined) {
        department.status =
          status;
      }

      const updatedDepartment =
        await department.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Département mis à jour avec succès",

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
            "Erreur lors de la modification du département",

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
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Identifiant du département invalide",
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
              "Département introuvable",
          });
      }

      // Vérifie si des membres
      // sont encore attachés
      const memberCount =
        await Member.countDocuments({
          church:
            req.churchId,

          department:
            department._id,
        });

      if (memberCount > 0) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              `Impossible de supprimer ce département : ${memberCount} membre(s) y sont encore rattaché(s).`,
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
            "Département supprimé avec succès",
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
            "Erreur lors de la suppression du département",
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
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
};