const mongoose = require("mongoose");
const FinanceCategory = require("../models/FinanceCategory");

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const getChurchId = (req) => {
  return req.churchId || req.user?.church?._id || req.user?.church || null;
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return Boolean(value);
};

const buildCategoryResponse = (category) => ({
  _id: category._id,
  church: category.church,
  name: category.name,
  description: category.description,
  type: category.type,
  code: category.code,
  color: category.color,
  icon: category.icon,
  isActive: category.isActive,
  isSystem: category.isSystem,
  sortOrder: category.sortOrder,
  createdBy: category.createdBy,
  updatedBy: category.updatedBy,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

// ======================================================
// GET ALL CATEGORIES
// GET /api/finance/categories
// ======================================================

const getFinanceCategories = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    const {
      type,
      isActive,
      search,
      page = 1,
      limit = 100,
    } = req.query;

    const numericPage = Math.max(parseInt(page, 10) || 1, 1);

    const numericLimit = Math.min(
      Math.max(parseInt(limit, 10) || 100, 1),
      500
    );

    const filter = {
      church: churchId,
    };

    if (type) {
      if (!["income", "expense"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Type de catégorie invalide.",
        });
      }

      filter.type = type;
    }

    if (isActive !== undefined) {
      filter.isActive = normalizeBoolean(isActive);
    }

    if (search && search.trim()) {
      const escapedSearch = search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        {
          name: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          description: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          code: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
      ];
    }

    const [categories, total] = await Promise.all([
      FinanceCategory.find(filter)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({
          type: 1,
          sortOrder: 1,
          name: 1,
        })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit),

      FinanceCategory.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: categories.map(buildCategoryResponse),
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total,
        totalPages: Math.max(Math.ceil(total / numericLimit), 1),
      },
    });
  } catch (error) {
    console.error("Erreur getFinanceCategories :", error);

    return res.status(500).json({
      success: false,
      message: "Impossible de récupérer les catégories financières.",
    });
  }
};

// ======================================================
// GET ONE CATEGORY
// GET /api/finance/categories/:id
// ======================================================

const getFinanceCategoryById = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const { id } = req.params;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Identifiant de catégorie invalide.",
      });
    }

    const category = await FinanceCategory.findOne({
      _id: id,
      church: churchId,
    })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Catégorie financière introuvable.",
      });
    }

    return res.status(200).json({
      success: true,
      data: buildCategoryResponse(category),
    });
  } catch (error) {
    console.error("Erreur getFinanceCategoryById :", error);

    return res.status(500).json({
      success: false,
      message: "Impossible de récupérer cette catégorie financière.",
    });
  }
};

// ======================================================
// CREATE CATEGORY
// POST /api/finance/categories
// ======================================================

const createFinanceCategory = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    const {
      name,
      description = "",
      type,
      code = "",
      color = "",
      icon = "",
      isActive = true,
      sortOrder = 0,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Le nom de la catégorie est obligatoire.",
      });
    }

    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({
        success: false,
        message:
          "Le type de catégorie doit être « income » ou « expense ».",
      });
    }

    const existingCategory = await FinanceCategory.findOne({
      church: churchId,
      type,
      name: name.trim(),
    }).collation({
      locale: "fr",
      strength: 2,
    });

    if (existingCategory) {
      return res.status(409).json({
        success: false,
        message:
          "Une catégorie portant ce nom existe déjà pour ce type financier.",
      });
    }

    if (code && code.trim()) {
      const existingCode = await FinanceCategory.findOne({
        church: churchId,
        code: code.trim().toUpperCase(),
      });

      if (existingCode) {
        return res.status(409).json({
          success: false,
          message:
            "Ce code est déjà utilisé par une autre catégorie financière.",
        });
      }
    }

    const category = await FinanceCategory.create({
      church: churchId,
      name: name.trim(),
      description,
      type,
      code,
      color,
      icon,
      isActive: normalizeBoolean(isActive),
      isSystem: false,
      sortOrder: Number.isFinite(Number(sortOrder))
        ? Math.max(Number(sortOrder), 0)
        : 0,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    await category.populate("createdBy", "name email");
    await category.populate("updatedBy", "name email");

    return res.status(201).json({
      success: true,
      message: "Catégorie financière créée avec succès.",
      data: buildCategoryResponse(category),
    });
  } catch (error) {
    console.error("Erreur createFinanceCategory :", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Cette catégorie ou ce code financier existe déjà pour cette église.",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          Object.values(error.errors)
            .map((item) => item.message)
            .join(" ") || "Données de catégorie invalides.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Impossible de créer la catégorie financière.",
    });
  }
};

// ======================================================
// UPDATE CATEGORY
// PUT /api/finance/categories/:id
// ======================================================

const updateFinanceCategory = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const { id } = req.params;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Identifiant de catégorie invalide.",
      });
    }

    const category = await FinanceCategory.findOne({
      _id: id,
      church: churchId,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Catégorie financière introuvable.",
      });
    }

    const {
      name,
      description,
      type,
      code,
      color,
      icon,
      isActive,
      sortOrder,
    } = req.body;

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Le nom de la catégorie est obligatoire.",
        });
      }

      const existingName = await FinanceCategory.findOne({
        _id: {
          $ne: category._id,
        },
        church: churchId,
        type: type || category.type,
        name: name.trim(),
      }).collation({
        locale: "fr",
        strength: 2,
      });

      if (existingName) {
        return res.status(409).json({
          success: false,
          message:
            "Une autre catégorie portant ce nom existe déjà pour ce type financier.",
        });
      }

      category.name = name.trim();
    }

    if (type !== undefined) {
      if (!["income", "expense"].includes(type)) {
        return res.status(400).json({
          success: false,
          message:
            "Le type de catégorie doit être « income » ou « expense ».",
        });
      }

      const existingNameForType =
        await FinanceCategory.findOne({
          _id: {
            $ne: category._id,
          },
          church: churchId,
          type,
          name: category.name,
        }).collation({
          locale: "fr",
          strength: 2,
        });

      if (existingNameForType) {
        return res.status(409).json({
          success: false,
          message:
            "Une catégorie portant ce nom existe déjà pour ce type financier.",
        });
      }

      category.type = type;
    }

    if (code !== undefined) {
      const normalizedCode =
        typeof code === "string"
          ? code.trim().toUpperCase()
          : "";

      if (normalizedCode) {
        const existingCode = await FinanceCategory.findOne({
          _id: {
            $ne: category._id,
          },
          church: churchId,
          code: normalizedCode,
        });

        if (existingCode) {
          return res.status(409).json({
            success: false,
            message:
              "Ce code est déjà utilisé par une autre catégorie financière.",
          });
        }
      }

      category.code = normalizedCode;
    }

    if (description !== undefined) {
      category.description = description;
    }

    if (color !== undefined) {
      category.color = color;
    }

    if (icon !== undefined) {
      category.icon = icon;
    }

    if (isActive !== undefined) {
      category.isActive = normalizeBoolean(isActive);
    }

    if (sortOrder !== undefined) {
      category.sortOrder = Number.isFinite(Number(sortOrder))
        ? Math.max(Number(sortOrder), 0)
        : category.sortOrder;
    }

    category.updatedBy = req.user?._id || null;

    await category.save();

    await category.populate("createdBy", "name email");
    await category.populate("updatedBy", "name email");

    return res.status(200).json({
      success: true,
      message: "Catégorie financière mise à jour avec succès.",
      data: buildCategoryResponse(category),
    });
  } catch (error) {
    console.error("Erreur updateFinanceCategory :", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Cette catégorie ou ce code financier existe déjà pour cette église.",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          Object.values(error.errors)
            .map((item) => item.message)
            .join(" ") || "Données de catégorie invalides.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Impossible de modifier la catégorie financière.",
    });
  }
};

// ======================================================
// TOGGLE ACTIVE
// PATCH /api/finance/categories/:id/status
// ======================================================

const toggleFinanceCategoryStatus = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const { id } = req.params;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Identifiant de catégorie invalide.",
      });
    }

    const category = await FinanceCategory.findOne({
      _id: id,
      church: churchId,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Catégorie financière introuvable.",
      });
    }

    category.isActive = !category.isActive;
    category.updatedBy = req.user?._id || null;

    await category.save();

    return res.status(200).json({
      success: true,
      message: category.isActive
        ? "Catégorie financière activée."
        : "Catégorie financière désactivée.",
      data: buildCategoryResponse(category),
    });
  } catch (error) {
    console.error("Erreur toggleFinanceCategoryStatus :", error);

    return res.status(500).json({
      success: false,
      message:
        "Impossible de modifier le statut de la catégorie financière.",
    });
  }
};

// ======================================================
// DELETE CATEGORY
// DELETE /api/finance/categories/:id
// ======================================================

const deleteFinanceCategory = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const { id } = req.params;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Identifiant de catégorie invalide.",
      });
    }

    const category = await FinanceCategory.findOne({
      _id: id,
      church: churchId,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Catégorie financière introuvable.",
      });
    }

    if (!category.canBeDeleted()) {
      return res.status(403).json({
        success: false,
        message:
          "Une catégorie système ne peut pas être supprimée.",
      });
    }

    await category.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Catégorie financière supprimée avec succès.",
    });
  } catch (error) {
    console.error("Erreur deleteFinanceCategory :", error);

    return res.status(500).json({
      success: false,
      message: "Impossible de supprimer la catégorie financière.",
    });
  }
};

// ======================================================
// STATS
// GET /api/finance/categories/stats/summary
// ======================================================

const getFinanceCategoryStats = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    const [total, active, income, expense] = await Promise.all([
      FinanceCategory.countDocuments({
        church: churchId,
      }),

      FinanceCategory.countDocuments({
        church: churchId,
        isActive: true,
      }),

      FinanceCategory.countDocuments({
        church: churchId,
        type: "income",
      }),

      FinanceCategory.countDocuments({
        church: churchId,
        type: "expense",
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        active,
        inactive: Math.max(total - active, 0),
        income,
        expense,
      },
    });
  } catch (error) {
    console.error("Erreur getFinanceCategoryStats :", error);

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer les statistiques des catégories financières.",
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getFinanceCategories,
  getFinanceCategoryById,
  createFinanceCategory,
  updateFinanceCategory,
  toggleFinanceCategoryStatus,
  deleteFinanceCategory,
  getFinanceCategoryStats,
};