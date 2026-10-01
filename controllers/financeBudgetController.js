const mongoose = require("mongoose");

const FinanceBudget = require("../models/FinanceBudget");
const FinanceCategory = require("../models/FinanceCategory");
const Department = require("../models/Department");
const FinanceTransaction = require("../models/FinanceTransaction");

// ======================================================
// CONSTANTES
// ======================================================

const VALID_PERIOD_TYPES = [
  "monthly",
  "quarterly",
  "yearly",
  "custom",
];

const VALID_SCOPE_TYPES = [
  "global",
  "category",
  "department",
];

const VALID_BUDGET_TYPES = [
  "expense",
  "income",
];

const VALID_STATUSES = [
  "draft",
  "active",
  "closed",
  "cancelled",
];

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value);

const getChurchId = (req) => {
  return (
    req.churchId ||
    req.user?.church?._id ||
    req.user?.church ||
    null
  );
};

const normalizeCurrency = (value) => {
  if (!value || typeof value !== "string") {
    return "EUR";
  }

  return value.trim().toUpperCase();
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

const escapeRegex = (value = "") => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// ======================================================
// POPULATE
// ======================================================

const populateBudget = async (budget) => {
  await budget.populate([
    {
      path: "category",
      select: "name description type code color icon isActive",
    },
    {
      path: "department",
      select: "name description isActive",
    },
    {
      path: "createdBy",
      select: "name email",
    },
    {
      path: "updatedBy",
      select: "name email",
    },
  ]);

  return budget;
};

// ======================================================
// VALIDATION CATÉGORIE
// ======================================================

const validateCategory = async ({
  churchId,
  categoryId,
  budgetType,
}) => {
  if (!categoryId || !isValidObjectId(categoryId)) {
    return {
      success: false,
      message: "Catégorie financière invalide.",
    };
  }

  const category = await FinanceCategory.findOne({
    _id: categoryId,
    church: churchId,
    isActive: true,
  });

  if (!category) {
    return {
      success: false,
      message:
        "Catégorie financière introuvable ou désactivée.",
    };
  }

  if (category.type !== budgetType) {
    return {
      success: false,
      message:
        budgetType === "expense"
          ? "Un budget de dépenses doit utiliser une catégorie de dépenses."
          : "Un budget de revenus doit utiliser une catégorie de revenus.",
    };
  }

  return {
    success: true,
    category,
  };
};

// ======================================================
// VALIDATION DÉPARTEMENT
// ======================================================

const validateDepartment = async ({
  churchId,
  departmentId,
}) => {
  if (!departmentId || !isValidObjectId(departmentId)) {
    return {
      success: false,
      message: "Département invalide.",
    };
  }

  const department = await Department.findOne({
    _id: departmentId,
    church: churchId,
  });

  if (!department) {
    return {
      success: false,
      message:
        "Le département sélectionné n'appartient pas à cette église.",
    };
  }

  return {
    success: true,
    department,
  };
};

// ======================================================
// VALIDATION DES DONNÉES MÉTIER
// ======================================================

const validateBudgetData = async ({
  churchId,
  name,
  periodType,
  startDate,
  endDate,
  amount,
  currency,
  scopeType,
  category,
  department,
  budgetType,
  warningThresholdPercent,
}) => {
  if (!name || !String(name).trim()) {
    return {
      success: false,
      message: "Le nom du budget est obligatoire.",
    };
  }

  if (!VALID_PERIOD_TYPES.includes(periodType)) {
    return {
      success: false,
      message: "Type de période budgétaire invalide.",
    };
  }

  if (!VALID_SCOPE_TYPES.includes(scopeType)) {
    return {
      success: false,
      message: "Portée budgétaire invalide.",
    };
  }

  if (!VALID_BUDGET_TYPES.includes(budgetType)) {
    return {
      success: false,
      message: "Type de budget invalide.",
    };
  }

  const numericAmount = Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount < 0
  ) {
    return {
      success: false,
      message:
        "Le montant du budget doit être supérieur ou égal à zéro.",
    };
  }

  const normalizedCurrency = normalizeCurrency(currency);

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return {
      success: false,
      message:
        "La devise doit être un code ISO de 3 lettres, par exemple EUR, USD ou XAF.",
    };
  }

  const parsedStartDate = new Date(startDate);
  const parsedEndDate = new Date(endDate);

  if (Number.isNaN(parsedStartDate.getTime())) {
    return {
      success: false,
      message: "Date de début du budget invalide.",
    };
  }

  if (Number.isNaN(parsedEndDate.getTime())) {
    return {
      success: false,
      message: "Date de fin du budget invalide.",
    };
  }

  if (parsedEndDate < parsedStartDate) {
    return {
      success: false,
      message:
        "La date de fin doit être postérieure ou égale à la date de début.",
    };
  }

  const threshold = Number(warningThresholdPercent);

  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 100
  ) {
    return {
      success: false,
      message:
        "Le seuil d'alerte doit être compris entre 0 et 100.",
    };
  }

  let validCategory = null;
  let validDepartment = null;

  // ====================================================
  // PORTÉE GLOBALE
  // ====================================================

  if (scopeType === "global") {
    return {
      success: true,
      name: String(name).trim(),
      periodType,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      amount: numericAmount,
      currency: normalizedCurrency,
      scopeType,
      category: null,
      department: null,
      budgetType,
      warningThresholdPercent: threshold,
    };
  }

  // ====================================================
  // PORTÉE CATÉGORIE
  // ====================================================

  if (scopeType === "category") {
    const categoryResult = await validateCategory({
      churchId,
      categoryId: category,
      budgetType,
    });

    if (!categoryResult.success) {
      return categoryResult;
    }

    validCategory = categoryResult.category;
  }

  // ====================================================
  // PORTÉE DÉPARTEMENT
  // ====================================================

  if (scopeType === "department") {
    const departmentResult = await validateDepartment({
      churchId,
      departmentId: department,
    });

    if (!departmentResult.success) {
      return departmentResult;
    }

    validDepartment = departmentResult.department;
  }

  return {
    success: true,
    name: String(name).trim(),
    periodType,
    startDate: parsedStartDate,
    endDate: parsedEndDate,
    amount: numericAmount,
    currency: normalizedCurrency,
    scopeType,
    category: validCategory,
    department: validDepartment,
    budgetType,
    warningThresholdPercent: threshold,
  };
};

// ======================================================
// CALCUL DU RÉALISÉ
// ======================================================

const calculateBudgetActual = async (budget) => {
  const transactionFilter = {
    church: budget.church,
    type: budget.budgetType,
    currency: budget.currency,
    status: "confirmed",

    transactionDate: {
      $gte: budget.startDate,
      $lte: budget.endDate,
    },
  };

  // ====================================================
  // BUDGET PAR CATÉGORIE
  // ====================================================

  if (
    budget.scopeType === "category" &&
    budget.category
  ) {
    transactionFilter.category =
      budget.category._id || budget.category;
  }

  /*
   * IMPORTANT :
   *
   * FinanceTransaction ne possède pas encore de champ
   * department.
   *
   * Nous ne devons donc PAS inventer des dépenses
   * départementales.
   *
   * Tant que les transactions ne sont pas liées à un
   * département, un budget de département retourne
   * actual = 0.
   *
   * Nous ajouterons ce lien proprement dans l'évolution
   * du module financier.
   */

  if (budget.scopeType === "department") {
    return {
      actual: 0,
      transactionCount: 0,
      trackingAvailable: false,
    };
  }

  const result = await FinanceTransaction.aggregate([
    {
      $match: {
        ...transactionFilter,

        church: new mongoose.Types.ObjectId(
          String(budget.church)
        ),

        ...(transactionFilter.category
          ? {
              category: new mongoose.Types.ObjectId(
                String(transactionFilter.category)
              ),
            }
          : {}),
      },
    },

    {
      $group: {
        _id: null,

        actual: {
          $sum: "$amount",
        },

        transactionCount: {
          $sum: 1,
        },
      },
    },
  ]);

  return {
    actual: result[0]?.actual || 0,
    transactionCount:
      result[0]?.transactionCount || 0,
    trackingAvailable: true,
  };
};

// ======================================================
// CONSTRUIRE LE RÉSUMÉ D'UN BUDGET
// ======================================================

const buildBudgetSummary = async (budget) => {
  const actualData =
    await calculateBudgetActual(budget);

  const budgetAmount = Number(budget.amount);
  const actual = Number(actualData.actual);

  const remaining = budgetAmount - actual;

  const usagePercent =
    budgetAmount > 0
      ? Number(
          ((actual / budgetAmount) * 100).toFixed(2)
        )
      : actual > 0
      ? 100
      : 0;

  const threshold =
    Number(budget.warningThresholdPercent) || 0;

  const warningAmount =
    (budgetAmount * threshold) / 100;

  const alertTriggered =
    budget.enableAlerts === true &&
    actual >= warningAmount &&
    budgetAmount > 0;

  const exceeded =
    actual > budgetAmount;

  return {
    actual,
    transactionCount:
      actualData.transactionCount,

    trackingAvailable:
      actualData.trackingAvailable,

    remaining,

    usagePercent,

    warningAmount,

    alertTriggered,

    exceeded,

    exceededAmount:
      exceeded
        ? actual - budgetAmount
        : 0,
  };
};

// ======================================================
// GET ALL
// GET /api/finance/budgets
// ======================================================

const getFinanceBudgets = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    const {
      status,
      budgetType,
      scopeType,
      currency,
      periodType,
      isActive,
      search,
      page = 1,
      limit = 100,
    } = req.query;

    const numericPage = Math.max(
      parseInt(page, 10) || 1,
      1
    );

    const numericLimit = Math.min(
      Math.max(parseInt(limit, 10) || 100, 1),
      500
    );

    const filter = {
      church: churchId,
    };

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Statut budgétaire invalide.",
        });
      }

      filter.status = status;
    }

    if (budgetType) {
      if (!VALID_BUDGET_TYPES.includes(budgetType)) {
        return res.status(400).json({
          success: false,
          message: "Type de budget invalide.",
        });
      }

      filter.budgetType = budgetType;
    }

    if (scopeType) {
      if (!VALID_SCOPE_TYPES.includes(scopeType)) {
        return res.status(400).json({
          success: false,
          message: "Portée budgétaire invalide.",
        });
      }

      filter.scopeType = scopeType;
    }

    if (periodType) {
      if (!VALID_PERIOD_TYPES.includes(periodType)) {
        return res.status(400).json({
          success: false,
          message:
            "Type de période budgétaire invalide.",
        });
      }

      filter.periodType = periodType;
    }

    if (currency) {
      filter.currency = normalizeCurrency(currency);
    }

    if (isActive !== undefined) {
      filter.isActive = normalizeBoolean(isActive);
    }

    if (search && search.trim()) {
      const regex = new RegExp(
        escapeRegex(search.trim()),
        "i"
      );

      filter.$or = [
        {
          name: regex,
        },
        {
          description: regex,
        },
        {
          note: regex,
        },
      ];
    }

    const [budgets, total] = await Promise.all([
      FinanceBudget.find(filter)
        .populate(
          "category",
          "name type code color icon"
        )
        .populate(
          "department",
          "name description isActive"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        )
        .sort({
          startDate: -1,
          createdAt: -1,
        })
        .skip(
          (numericPage - 1) * numericLimit
        )
        .limit(numericLimit),

      FinanceBudget.countDocuments(filter),
    ]);

    const data = await Promise.all(
      budgets.map(async (budget) => {
        const summary =
          await buildBudgetSummary(budget);

        return {
          ...budget.toObject(),
          summary,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data,

      pagination: {
        page: numericPage,
        limit: numericLimit,
        total,

        totalPages: Math.max(
          Math.ceil(total / numericLimit),
          1
        ),
      },
    });
  } catch (error) {
    console.error(
      "Erreur getFinanceBudgets :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer les budgets financiers.",
    });
  }
};

// ======================================================
// GET ONE
// GET /api/finance/budgets/:id
// ======================================================

const getFinanceBudgetById = async (req, res) => {
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
        message: "Identifiant de budget invalide.",
      });
    }

    const budget = await FinanceBudget.findOne({
      _id: id,
      church: churchId,
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: "Budget financier introuvable.",
      });
    }

    await populateBudget(budget);

    const summary =
      await buildBudgetSummary(budget);

    return res.status(200).json({
      success: true,

      data: {
        ...budget.toObject(),
        summary,
      },
    });
  } catch (error) {
    console.error(
      "Erreur getFinanceBudgetById :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer ce budget financier.",
    });
  }
};

// ======================================================
// CREATE
// POST /api/finance/budgets
// ======================================================

const createFinanceBudget = async (req, res) => {
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

      periodType = "monthly",
      startDate,
      endDate,

      amount,
      currency = "EUR",

      scopeType = "global",
      category = null,
      department = null,

      budgetType = "expense",

      warningThresholdPercent = 80,
      enableAlerts = true,

      status = "draft",
      isActive = true,

      note = "",
    } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Statut budgétaire invalide.",
      });
    }

    const validation =
      await validateBudgetData({
        churchId,
        name,
        periodType,
        startDate,
        endDate,
        amount,
        currency,
        scopeType,
        category,
        department,
        budgetType,
        warningThresholdPercent,
      });

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const budget = await FinanceBudget.create({
      church: churchId,

      name: validation.name,
      description,

      periodType:
        validation.periodType,

      startDate:
        validation.startDate,

      endDate:
        validation.endDate,

      amount:
        validation.amount,

      currency:
        validation.currency,

      scopeType:
        validation.scopeType,

      category:
        validation.category?._id || null,

      department:
        validation.department?._id || null,

      budgetType:
        validation.budgetType,

      warningThresholdPercent:
        validation.warningThresholdPercent,

      enableAlerts:
        normalizeBoolean(enableAlerts),

      status,

      isActive:
        normalizeBoolean(isActive),

      note,

      createdBy:
        req.user?._id || null,

      updatedBy:
        req.user?._id || null,
    });

    await populateBudget(budget);

    const summary =
      await buildBudgetSummary(budget);

    return res.status(201).json({
      success: true,
      message:
        "Budget financier créé avec succès.",

      data: {
        ...budget.toObject(),
        summary,
      },
    });
  } catch (error) {
    console.error(
      "Erreur createFinanceBudget :",
      error
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Un budget similaire existe déjà pour cette église.",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,

        message:
          Object.values(error.errors)
            .map((item) => item.message)
            .join(" ") ||
          "Données budgétaires invalides.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Impossible de créer le budget financier.",
    });
  }
};

// ======================================================
// UPDATE
// PUT /api/finance/budgets/:id
// ======================================================

const updateFinanceBudget = async (req, res) => {
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
        message: "Identifiant de budget invalide.",
      });
    }

    const budget = await FinanceBudget.findOne({
      _id: id,
      church: churchId,
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: "Budget financier introuvable.",
      });
    }

    if (
      budget.status === "closed" ||
      budget.status === "cancelled"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Un budget clôturé ou annulé ne peut plus être modifié.",
      });
    }

    const merged = {
      name:
        req.body.name ??
        budget.name,

      periodType:
        req.body.periodType ??
        budget.periodType,

      startDate:
        req.body.startDate ??
        budget.startDate,

      endDate:
        req.body.endDate ??
        budget.endDate,

      amount:
        req.body.amount ??
        budget.amount,

      currency:
        req.body.currency ??
        budget.currency,

      scopeType:
        req.body.scopeType ??
        budget.scopeType,

      category:
        req.body.category !== undefined
          ? req.body.category
          : budget.category,

      department:
        req.body.department !== undefined
          ? req.body.department
          : budget.department,

      budgetType:
        req.body.budgetType ??
        budget.budgetType,

      warningThresholdPercent:
        req.body.warningThresholdPercent ??
        budget.warningThresholdPercent,
    };

    const validation =
      await validateBudgetData({
        churchId,
        ...merged,
      });

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    budget.name =
      validation.name;

    budget.periodType =
      validation.periodType;

    budget.startDate =
      validation.startDate;

    budget.endDate =
      validation.endDate;

    budget.amount =
      validation.amount;

    budget.currency =
      validation.currency;

    budget.scopeType =
      validation.scopeType;

    budget.category =
      validation.category?._id || null;

    budget.department =
      validation.department?._id || null;

    budget.budgetType =
      validation.budgetType;

    budget.warningThresholdPercent =
      validation.warningThresholdPercent;

    if (req.body.description !== undefined) {
      budget.description =
        req.body.description;
    }

    if (req.body.enableAlerts !== undefined) {
      budget.enableAlerts =
        normalizeBoolean(
          req.body.enableAlerts
        );
    }

    if (req.body.isActive !== undefined) {
      budget.isActive =
        normalizeBoolean(
          req.body.isActive
        );
    }

    if (req.body.note !== undefined) {
      budget.note =
        req.body.note;
    }

    if (req.body.status !== undefined) {
      if (
        !VALID_STATUSES.includes(
          req.body.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Statut budgétaire invalide.",
        });
      }

      budget.status =
        req.body.status;
    }

    budget.updatedBy =
      req.user?._id || null;

    await budget.save();

    await populateBudget(budget);

    const summary =
      await buildBudgetSummary(budget);

    return res.status(200).json({
      success: true,

      message:
        "Budget financier mis à jour avec succès.",

      data: {
        ...budget.toObject(),
        summary,
      },
    });
  } catch (error) {
    console.error(
      "Erreur updateFinanceBudget :",
      error
    );

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,

        message:
          Object.values(error.errors)
            .map((item) => item.message)
            .join(" ") ||
          "Données budgétaires invalides.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Impossible de modifier le budget financier.",
    });
  }
};

// ======================================================
// CHANGE STATUS
// PATCH /api/finance/budgets/:id/status
// ======================================================

const changeFinanceBudgetStatus =
  async (req, res) => {
    try {
      const churchId = getChurchId(req);
      const { id } = req.params;
      const { status } = req.body;

      if (!churchId) {
        return res.status(400).json({
          success: false,
          message:
            "Église active introuvable.",
        });
      }

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Identifiant de budget invalide.",
        });
      }

      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message:
            "Statut budgétaire invalide.",
        });
      }

      const budget =
        await FinanceBudget.findOne({
          _id: id,
          church: churchId,
        });

      if (!budget) {
        return res.status(404).json({
          success: false,
          message:
            "Budget financier introuvable.",
        });
      }

      if (
        budget.status === "cancelled"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Un budget annulé ne peut plus changer de statut.",
        });
      }

      if (
        budget.status === "closed" &&
        status !== "closed"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Un budget clôturé ne peut pas être réactivé.",
        });
      }

      budget.status = status;

      if (
        status === "closed" ||
        status === "cancelled"
      ) {
        budget.isActive = false;
      }

      if (status === "active") {
        budget.isActive = true;
      }

      budget.updatedBy =
        req.user?._id || null;

      await budget.save();

      await populateBudget(budget);

      const summary =
        await buildBudgetSummary(budget);

      return res.status(200).json({
        success: true,

        message:
          "Statut du budget mis à jour avec succès.",

        data: {
          ...budget.toObject(),
          summary,
        },
      });
    } catch (error) {
      console.error(
        "Erreur changeFinanceBudgetStatus :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de modifier le statut du budget.",
      });
    }
  };

// ======================================================
// DELETE
// DELETE /api/finance/budgets/:id
// ======================================================

const deleteFinanceBudget = async (req, res) => {
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
        message: "Identifiant de budget invalide.",
      });
    }

    const budget = await FinanceBudget.findOne({
      _id: id,
      church: churchId,
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: "Budget financier introuvable.",
      });
    }

    if (budget.status !== "draft") {
      return res.status(409).json({
        success: false,
        message:
          "Seul un budget en brouillon peut être supprimé. Un budget actif doit être clôturé ou annulé afin de conserver l'historique.",
      });
    }

    await budget.deleteOne();

    return res.status(200).json({
      success: true,
      message:
        "Brouillon budgétaire supprimé avec succès.",
    });
  } catch (error) {
    console.error(
      "Erreur deleteFinanceBudget :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de supprimer le budget financier.",
    });
  }
};

// ======================================================
// STATISTIQUES
// GET /api/finance/budgets/stats/summary
// ======================================================

const getFinanceBudgetStats = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Église active introuvable.",
      });
    }

    const budgets = await FinanceBudget.find({
      church: churchId,
    })
      .populate(
        "category",
        "name type code"
      )
      .populate(
        "department",
        "name"
      );

    const data = {
      total: budgets.length,
      draft: 0,
      active: 0,
      closed: 0,
      cancelled: 0,

      byCurrency: {},
    };

    for (const budget of budgets) {
      if (
        Object.prototype.hasOwnProperty.call(
          data,
          budget.status
        )
      ) {
        data[budget.status] += 1;
      }

      const summary =
        await buildBudgetSummary(budget);

      if (!data.byCurrency[budget.currency]) {
        data.byCurrency[budget.currency] = {
          budgetedExpense: 0,
          actualExpense: 0,

          budgetedIncome: 0,
          actualIncome: 0,

          exceededBudgets: 0,
          alertBudgets: 0,
        };
      }

      const currencyData =
        data.byCurrency[budget.currency];

      if (budget.budgetType === "expense") {
        currencyData.budgetedExpense +=
          Number(budget.amount);

        currencyData.actualExpense +=
          Number(summary.actual);
      }

      if (budget.budgetType === "income") {
        currencyData.budgetedIncome +=
          Number(budget.amount);

        currencyData.actualIncome +=
          Number(summary.actual);
      }

      if (summary.exceeded) {
        currencyData.exceededBudgets += 1;
      }

      if (summary.alertTriggered) {
        currencyData.alertBudgets += 1;
      }
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Erreur getFinanceBudgetStats :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer les statistiques budgétaires.",
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getFinanceBudgets,
  getFinanceBudgetById,
  createFinanceBudget,
  updateFinanceBudget,
  changeFinanceBudgetStatus,
  deleteFinanceBudget,
  getFinanceBudgetStats,
};