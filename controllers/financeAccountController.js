const mongoose = require("mongoose");
const FinanceAccount = require("../models/FinanceAccount");
const FinanceTransaction = require("../models/FinanceTransaction");

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

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return Boolean(value);
};

const normalizeCurrency = (value) => {
  if (!value || typeof value !== "string") {
    return "EUR";
  }

  return value.trim().toUpperCase();
};

const VALID_ACCOUNT_TYPES = [
  "cash",
  "bank",
  "mobile_money",
  "card",
  "online",
  "other",
];

const buildAccountResponse = (account) => ({
  _id: account._id,
  church: account.church,

  name: account.name,
  description: account.description,

  type: account.type,
  currency: account.currency,

  openingBalance: account.openingBalance,
  currentBalance: account.currentBalance,

  allowNegativeBalance:
    account.allowNegativeBalance === true,

  reference: account.reference,
  bankName: account.bankName,
  accountNumberMasked:
    account.accountNumberMasked,
  mobileProvider: account.mobileProvider,

  color: account.color,
  icon: account.icon,

  isActive: account.isActive,
  isDefault: account.isDefault,
  isSystem: account.isSystem,
  sortOrder: account.sortOrder,

  createdBy: account.createdBy,
  updatedBy: account.updatedBy,

  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
});

// ======================================================
// GET ALL ACCOUNTS
// GET /api/finance/accounts
// ======================================================

const getFinanceAccounts = async (req, res) => {
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
      currency,
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
      Math.max(
        parseInt(limit, 10) || 100,
        1
      ),
      500
    );

    const filter = {
      church: churchId,
    };

    if (type) {
      if (!VALID_ACCOUNT_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message:
            "Type de compte financier invalide.",
        });
      }

      filter.type = type;
    }

    if (currency) {
      filter.currency =
        normalizeCurrency(currency);
    }

    if (isActive !== undefined) {
      filter.isActive =
        normalizeBoolean(isActive);
    }

    if (search && search.trim()) {
      const escapedSearch = search
        .trim()
        .replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

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
          reference: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          bankName: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          mobileProvider: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
      ];
    }

    const [accounts, total] =
      await Promise.all([
        FinanceAccount.find(filter)
          .populate(
            "createdBy",
            "name email"
          )
          .populate(
            "updatedBy",
            "name email"
          )
          .sort({
            isDefault: -1,
            sortOrder: 1,
            name: 1,
          })
          .skip(
            (numericPage - 1) *
              numericLimit
          )
          .limit(numericLimit),

        FinanceAccount.countDocuments(
          filter
        ),
      ]);

    return res.status(200).json({
      success: true,

      data: accounts.map(
        buildAccountResponse
      ),

      pagination: {
        page: numericPage,
        limit: numericLimit,
        total,
        totalPages: Math.max(
          Math.ceil(
            total / numericLimit
          ),
          1
        ),
      },
    });
  } catch (error) {
    console.error(
      "Erreur getFinanceAccounts :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer les comptes financiers.",
    });
  }
};

// ======================================================
// GET ONE ACCOUNT
// GET /api/finance/accounts/:id
// ======================================================

const getFinanceAccountById = async (
  req,
  res
) => {
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
        message:
          "Identifiant de compte financier invalide.",
      });
    }

    const account =
      await FinanceAccount.findOne({
        _id: id,
        church: churchId,
      })
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Compte financier introuvable.",
      });
    }

    return res.status(200).json({
      success: true,
      data: buildAccountResponse(
        account
      ),
    });
  } catch (error) {
    console.error(
      "Erreur getFinanceAccountById :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer ce compte financier.",
    });
  }
};

// ======================================================
// CREATE ACCOUNT
// POST /api/finance/accounts
// ======================================================

const createFinanceAccount = async (
  req,
  res
) => {
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
      currency = "EUR",
      openingBalance = 0,

      reference = "",
      bankName = "",
      accountNumberMasked = "",
      mobileProvider = "",

      color = "",
      icon = "",

      isActive = true,
      isDefault = false,

      allowNegativeBalance = false,

      sortOrder = 0,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Le nom du compte financier est obligatoire.",
      });
    }

    if (
      !type ||
      !VALID_ACCOUNT_TYPES.includes(type)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Type de compte financier invalide.",
      });
    }

    const normalizedCurrency =
      normalizeCurrency(currency);

    if (
      !/^[A-Z]{3}$/.test(
        normalizedCurrency
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "La devise doit être un code ISO de 3 lettres, par exemple EUR, USD ou XAF.",
      });
    }

    const parsedOpeningBalance =
      Number(openingBalance);

    if (
      !Number.isFinite(
        parsedOpeningBalance
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Le solde initial doit être un nombre valide.",
      });
    }

    const existingAccount =
      await FinanceAccount.findOne({
        church: churchId,
        name: name.trim(),
      }).collation({
        locale: "fr",
        strength: 2,
      });

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        message:
          "Un compte financier portant ce nom existe déjà.",
      });
    }

    const shouldBeDefault =
      normalizeBoolean(isDefault);

    if (shouldBeDefault) {
      await FinanceAccount.updateMany(
        {
          church: churchId,
          isDefault: true,
        },
        {
          $set: {
            isDefault: false,
          },
        }
      );
    }

    const account =
      await FinanceAccount.create({
        church: churchId,

        name: name.trim(),
        description,

        type,
        currency:
          normalizedCurrency,

        openingBalance:
          parsedOpeningBalance,

        reference,
        bankName,
        accountNumberMasked,
        mobileProvider,

        color,
        icon,

        isActive:
          normalizeBoolean(
            isActive
          ),

        isDefault:
          shouldBeDefault,

        allowNegativeBalance:
          normalizeBoolean(
            allowNegativeBalance
          ),

        isSystem: false,

        sortOrder:
          Number.isFinite(
            Number(sortOrder)
          )
            ? Math.max(
                Number(sortOrder),
                0
              )
            : 0,

        createdBy:
          req.user?._id || null,

        updatedBy:
          req.user?._id || null,
      });

    await account.populate(
      "createdBy",
      "name email"
    );

    await account.populate(
      "updatedBy",
      "name email"
    );

    return res.status(201).json({
      success: true,
      message:
        "Compte financier créé avec succès.",
      data: buildAccountResponse(
        account
      ),
    });
  } catch (error) {
    console.error(
      "Erreur createFinanceAccount :",
      error
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Un compte financier portant ce nom existe déjà pour cette église.",
      });
    }

    if (
      error?.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          Object.values(
            error.errors
          )
            .map(
              (item) =>
                item.message
            )
            .join(" ") ||
          "Données du compte financier invalides.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Impossible de créer le compte financier.",
    });
  }
};

// ======================================================
// UPDATE ACCOUNT
// PUT /api/finance/accounts/:id
// ======================================================

const updateFinanceAccount = async (
  req,
  res
) => {
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
        message:
          "Identifiant de compte financier invalide.",
      });
    }

    const account =
      await FinanceAccount.findOne({
        _id: id,
        church: churchId,
      });

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Compte financier introuvable.",
      });
    }

    const {
      name,
      description,
      type,
      currency,

      reference,
      bankName,
      accountNumberMasked,
      mobileProvider,

      color,
      icon,

      isActive,
      isDefault,

      allowNegativeBalance,

      sortOrder,
    } = req.body;

    // --------------------------------------------------
    // NOM
    // --------------------------------------------------

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Le nom du compte financier est obligatoire.",
        });
      }

      const existingAccount =
        await FinanceAccount.findOne({
          _id: {
            $ne: account._id,
          },
          church: churchId,
          name: name.trim(),
        }).collation({
          locale: "fr",
          strength: 2,
        });

      if (existingAccount) {
        return res.status(409).json({
          success: false,
          message:
            "Un autre compte financier porte déjà ce nom.",
        });
      }

      account.name =
        name.trim();
    }

    // --------------------------------------------------
    // TYPE
    // --------------------------------------------------

    if (type !== undefined) {
      if (
        !VALID_ACCOUNT_TYPES.includes(
          type
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Type de compte financier invalide.",
        });
      }

      account.type = type;
    }

    // --------------------------------------------------
    // DEVISE
    // --------------------------------------------------

    if (currency !== undefined) {
      const normalizedCurrency =
        normalizeCurrency(
          currency
        );

      if (
        !/^[A-Z]{3}$/.test(
          normalizedCurrency
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "La devise doit être un code ISO de 3 lettres.",
        });
      }

      const transactionExists =
        await FinanceTransaction.exists({
          church: churchId,
          $or: [
            {
              account:
                account._id,
            },
            {
              fromAccount:
                account._id,
            },
            {
              toAccount:
                account._id,
            },
          ],
        });

      if (
        transactionExists &&
        normalizedCurrency !==
          account.currency
      ) {
        return res.status(409).json({
          success: false,
          message:
            "La devise d'un compte ayant déjà des transactions ne peut pas être modifiée.",
        });
      }

      account.currency =
        normalizedCurrency;
    }

    // --------------------------------------------------
    // AUTRES INFORMATIONS
    // --------------------------------------------------

    if (
      description !== undefined
    ) {
      account.description =
        description;
    }

    if (reference !== undefined) {
      account.reference =
        reference;
    }

    if (bankName !== undefined) {
      account.bankName =
        bankName;
    }

    if (
      accountNumberMasked !==
      undefined
    ) {
      account.accountNumberMasked =
        accountNumberMasked;
    }

    if (
      mobileProvider !==
      undefined
    ) {
      account.mobileProvider =
        mobileProvider;
    }

    if (color !== undefined) {
      account.color = color;
    }

    if (icon !== undefined) {
      account.icon = icon;
    }

    if (isActive !== undefined) {
      account.isActive =
        normalizeBoolean(
          isActive
        );
    }

    // --------------------------------------------------
    // AUTORISATION DU SOLDE NÉGATIF
    // --------------------------------------------------

    if (
      allowNegativeBalance !==
      undefined
    ) {
      account.allowNegativeBalance =
        normalizeBoolean(
          allowNegativeBalance
        );
    }

    // --------------------------------------------------
    // COMPTE PAR DÉFAUT
    // --------------------------------------------------

    if (isDefault !== undefined) {
      const shouldBeDefault =
        normalizeBoolean(
          isDefault
        );

      if (shouldBeDefault) {
        await FinanceAccount.updateMany(
          {
            church: churchId,
            _id: {
              $ne: account._id,
            },
            isDefault: true,
          },
          {
            $set: {
              isDefault: false,
            },
          }
        );
      }

      account.isDefault =
        shouldBeDefault;
    }

    // --------------------------------------------------
    // ORDRE
    // --------------------------------------------------

    if (sortOrder !== undefined) {
      const parsedSortOrder =
        Number(sortOrder);

      if (
        Number.isFinite(
          parsedSortOrder
        )
      ) {
        account.sortOrder =
          Math.max(
            parsedSortOrder,
            0
          );
      }
    }

    account.updatedBy =
      req.user?._id || null;

    await account.save();

    await account.populate(
      "createdBy",
      "name email"
    );

    await account.populate(
      "updatedBy",
      "name email"
    );

    return res.status(200).json({
      success: true,
      message:
        "Compte financier mis à jour avec succès.",
      data: buildAccountResponse(
        account
      ),
    });
  } catch (error) {
    console.error(
      "Erreur updateFinanceAccount :",
      error
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Un compte financier portant ce nom existe déjà pour cette église.",
      });
    }

    if (
      error?.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          Object.values(
            error.errors
          )
            .map(
              (item) =>
                item.message
            )
            .join(" ") ||
          "Données du compte financier invalides.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Impossible de modifier le compte financier.",
    });
  }
};

// ======================================================
// TOGGLE STATUS
// PATCH /api/finance/accounts/:id/status
// ======================================================

const toggleFinanceAccountStatus =
  async (req, res) => {
    try {
      const churchId =
        getChurchId(req);

      const { id } = req.params;

      if (!churchId) {
        return res.status(400).json({
          success: false,
          message:
            "Église active introuvable.",
        });
      }

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Identifiant de compte financier invalide.",
        });
      }

      const account =
        await FinanceAccount.findOne({
          _id: id,
          church: churchId,
        });

      if (!account) {
        return res.status(404).json({
          success: false,
          message:
            "Compte financier introuvable.",
        });
      }

      account.isActive =
        !account.isActive;

      if (!account.isActive) {
        account.isDefault = false;
      }

      account.updatedBy =
        req.user?._id || null;

      await account.save();

      return res.status(200).json({
        success: true,

        message:
          account.isActive
            ? "Compte financier activé."
            : "Compte financier désactivé.",

        data:
          buildAccountResponse(
            account
          ),
      });
    } catch (error) {
      console.error(
        "Erreur toggleFinanceAccountStatus :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de modifier le statut du compte financier.",
      });
    }
  };

// ======================================================
// SET DEFAULT ACCOUNT
// PATCH /api/finance/accounts/:id/default
// ======================================================

const setDefaultFinanceAccount =
  async (req, res) => {
    try {
      const churchId =
        getChurchId(req);

      const { id } = req.params;

      if (!churchId) {
        return res.status(400).json({
          success: false,
          message:
            "Église active introuvable.",
        });
      }

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Identifiant de compte financier invalide.",
        });
      }

      const account =
        await FinanceAccount.findOne({
          _id: id,
          church: churchId,
        });

      if (!account) {
        return res.status(404).json({
          success: false,
          message:
            "Compte financier introuvable.",
        });
      }

      if (!account.isActive) {
        return res.status(409).json({
          success: false,
          message:
            "Un compte désactivé ne peut pas devenir le compte par défaut.",
        });
      }

      await FinanceAccount.updateMany(
        {
          church: churchId,
          _id: {
            $ne: account._id,
          },
          isDefault: true,
        },
        {
          $set: {
            isDefault: false,
          },
        }
      );

      account.isDefault = true;

      account.updatedBy =
        req.user?._id || null;

      await account.save();

      return res.status(200).json({
        success: true,
        message:
          "Compte financier défini comme compte par défaut.",

        data:
          buildAccountResponse(
            account
          ),
      });
    } catch (error) {
      console.error(
        "Erreur setDefaultFinanceAccount :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de définir le compte financier par défaut.",
      });
    }
  };

// ======================================================
// DELETE ACCOUNT
// DELETE /api/finance/accounts/:id
// ======================================================

const deleteFinanceAccount = async (
  req,
  res
) => {
  try {
    const churchId = getChurchId(req);
    const { id } = req.params;

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
          "Identifiant de compte financier invalide.",
      });
    }

    const account =
      await FinanceAccount.findOne({
        _id: id,
        church: churchId,
      });

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Compte financier introuvable.",
      });
    }

    if (!account.canBeDeleted()) {
      return res.status(403).json({
        success: false,
        message:
          "Un compte système ne peut pas être supprimé.",
      });
    }

    const transactionExists =
      await FinanceTransaction.exists({
        church: churchId,
        $or: [
          {
            account: account._id,
          },
          {
            fromAccount:
              account._id,
          },
          {
            toAccount:
              account._id,
          },
        ],
      });

    if (transactionExists) {
      return res.status(409).json({
        success: false,
        message:
          "Ce compte possède déjà des transactions. Désactivez-le au lieu de le supprimer.",
      });
    }

    await account.deleteOne();

    return res.status(200).json({
      success: true,
      message:
        "Compte financier supprimé avec succès.",
    });
  } catch (error) {
    console.error(
      "Erreur deleteFinanceAccount :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de supprimer le compte financier.",
    });
  }
};

// ======================================================
// STATS / SUMMARY
// GET /api/finance/accounts/stats/summary
// ======================================================

const getFinanceAccountStats = async (
  req,
  res
) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message:
          "Église active introuvable.",
      });
    }

    const accounts =
      await FinanceAccount.find({
        church: churchId,
      }).select(
        "type currency currentBalance isActive allowNegativeBalance"
      );

    const activeAccounts =
      accounts.filter(
        (account) =>
          account.isActive
      );

    const balancesByCurrency = {};

    for (
      const account of activeAccounts
    ) {
      const currency =
        account.currency || "EUR";

      if (
        !balancesByCurrency[
          currency
        ]
      ) {
        balancesByCurrency[
          currency
        ] = 0;
      }

      balancesByCurrency[
        currency
      ] +=
        Number(
          account.currentBalance
        ) || 0;
    }

    const byType = {};

    for (const account of accounts) {
      if (!byType[account.type]) {
        byType[account.type] = 0;
      }

      byType[account.type] += 1;
    }

    const negativeBalanceAllowed =
      accounts.filter(
        (account) =>
          account.allowNegativeBalance ===
          true
      ).length;

    const negativeBalanceProtected =
      accounts.filter(
        (account) =>
          account.allowNegativeBalance !==
          true
      ).length;

    return res.status(200).json({
      success: true,

      data: {
        total: accounts.length,

        active:
          activeAccounts.length,

        inactive:
          accounts.length -
          activeAccounts.length,

        byType,

        balancesByCurrency,

        negativeBalanceAllowed,

        negativeBalanceProtected,
      },
    });
  } catch (error) {
    console.error(
      "Erreur getFinanceAccountStats :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer les statistiques des comptes financiers.",
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getFinanceAccounts,
  getFinanceAccountById,
  createFinanceAccount,
  updateFinanceAccount,
  toggleFinanceAccountStatus,
  setDefaultFinanceAccount,
  deleteFinanceAccount,
  getFinanceAccountStats,
};