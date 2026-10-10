// controllers/financeTransactionController.js

const mongoose = require("mongoose");

const FinanceTransaction = require("../models/FinanceTransaction");
const FinanceAccount = require("../models/FinanceAccount");
const FinanceCategory = require("../models/FinanceCategory");
const Member = require("../models/Member");

// ======================================================
// CONSTANTES
// ======================================================

const VALID_TYPES = ["income", "expense", "transfer"];

const VALID_STATUSES = [
  "draft",
  "confirmed",
  "cancelled",
];

const VALID_PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "mobile_money",
  "check",
  "online",
  "other",
];

// ======================================================
// HELPERS GÉNÉRAUX
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
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

const roundMoney = (value) => {
  return (
    Math.round(
      (Number(value) + Number.EPSILON) * 100
    ) / 100
  );
};

// ======================================================
// POPULATE STANDARD
// ======================================================

const populateTransaction = async (
  transaction
) => {
  await transaction.populate([
    {
      path: "category",
      select:
        "name description type code color icon isActive",
    },
    {
      path: "account",
      select:
        "name type currency currentBalance allowNegativeBalance isActive isDefault",
    },
    {
      path: "fromAccount",
      select:
        "name type currency currentBalance allowNegativeBalance isActive isDefault",
    },
    {
      path: "toAccount",
      select:
        "name type currency currentBalance allowNegativeBalance isActive isDefault",
    },
    {
      path: "member",
      select:
        "firstName lastName name email phone gender membershipType status",
    },
    {
      path: "createdBy",
      select: "name email",
    },
    {
      path: "updatedBy",
      select: "name email",
    },
    {
      path: "cancelledBy",
      select: "name email",
    },
  ]);

  return transaction;
};

// ======================================================
// VALIDATION COMPTE
// ======================================================

const getValidAccount = async ({
  accountId,
  churchId,
  requireActive = true,
}) => {
  if (
    !accountId ||
    !isValidObjectId(accountId)
  ) {
    return {
      success: false,
      message: "Compte financier invalide.",
    };
  }

  const filter = {
    _id: accountId,
    church: churchId,
  };

  if (requireActive) {
    filter.isActive = true;
  }

  const account =
    await FinanceAccount.findOne(filter);

  if (!account) {
    return {
      success: false,
      message: requireActive
        ? "Compte financier introuvable ou désactivé."
        : "Compte financier introuvable.",
    };
  }

  return {
    success: true,
    account,
  };
};

// ======================================================
// VALIDATION CATÉGORIE
// ======================================================

const getValidCategory = async ({
  categoryId,
  churchId,
  transactionType,
}) => {
  if (
    !categoryId ||
    !isValidObjectId(categoryId)
  ) {
    return {
      success: false,
      message:
        "Catégorie financière invalide.",
    };
  }

  const category =
    await FinanceCategory.findOne({
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

  if (category.type !== transactionType) {
    return {
      success: false,
      message:
        transactionType === "income"
          ? "Une entrée doit utiliser une catégorie de revenus."
          : "Une sortie doit utiliser une catégorie de dépenses.",
    };
  }

  return {
    success: true,
    category,
  };
};

// ======================================================
// VALIDATION MEMBRE
// ======================================================

const getValidMember = async ({
  memberId,
  churchId,
}) => {
  if (!memberId) {
    return {
      success: true,
      member: null,
    };
  }

  if (!isValidObjectId(memberId)) {
    return {
      success: false,
      message: "Membre invalide.",
    };
  }

  const member = await Member.findOne({
    _id: memberId,
    church: churchId,
  });

  if (!member) {
    return {
      success: false,
      message:
        "Le membre sélectionné n'appartient pas à cette église.",
    };
  }

  return {
    success: true,
    member,
  };
};

// ======================================================
// VALIDATION COMPLÈTE
// ======================================================

const validateTransactionData = async ({
  churchId,
  type,
  amount,
  currency,
  category,
  account,
  fromAccount,
  toAccount,
  member,
  isAnonymous = false,
  paymentMethod = "cash",
}) => {
  if (!VALID_TYPES.includes(type)) {
    return {
      success: false,
      message:
        "Le type doit être « income », « expense » ou « transfer ».",
    };
  }

  const numericAmount = Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    return {
      success: false,
      message:
        "Le montant doit être supérieur à zéro.",
    };
  }

  const normalizedCurrency =
    normalizeCurrency(currency);

  if (
    !/^[A-Z]{3}$/.test(
      normalizedCurrency
    )
  ) {
    return {
      success: false,
      message:
        "La devise doit être un code de 3 lettres, par exemple EUR, USD ou XAF.",
    };
  }

  if (
    paymentMethod &&
    !VALID_PAYMENT_METHODS.includes(
      paymentMethod
    )
  ) {
    return {
      success: false,
      message:
        "Moyen de paiement invalide.",
    };
  }

  // ====================================================
  // ENTRÉE / SORTIE
  // ====================================================

  if (
    type === "income" ||
    type === "expense"
  ) {
    const accountResult =
      await getValidAccount({
        accountId: account,
        churchId,
        requireActive: true,
      });

    if (!accountResult.success) {
      return accountResult;
    }

    const categoryResult =
      await getValidCategory({
        categoryId: category,
        churchId,
        transactionType: type,
      });

    if (!categoryResult.success) {
      return categoryResult;
    }

    if (
      accountResult.account.currency !==
      normalizedCurrency
    ) {
      return {
        success: false,
        message:
          `La transaction est en ${normalizedCurrency}, ` +
          `mais le compte « ${accountResult.account.name} » ` +
          `utilise ${accountResult.account.currency}.`,
      };
    }

    let validMember = null;

    if (
      type === "income" &&
      !normalizeBoolean(isAnonymous) &&
      member
    ) {
      const memberResult =
        await getValidMember({
          memberId: member,
          churchId,
        });

      if (!memberResult.success) {
        return memberResult;
      }

      validMember = memberResult.member;
    }

    return {
      success: true,
      amount: numericAmount,
      currency: normalizedCurrency,
      account: accountResult.account,
      category: categoryResult.category,
      member: validMember,
    };
  }

  // ====================================================
  // TRANSFERT
  // ====================================================

  const fromResult =
    await getValidAccount({
      accountId: fromAccount,
      churchId,
      requireActive: true,
    });

  if (!fromResult.success) {
    return {
      success: false,
      message:
        `Compte source : ${fromResult.message}`,
    };
  }

  const toResult =
    await getValidAccount({
      accountId: toAccount,
      churchId,
      requireActive: true,
    });

  if (!toResult.success) {
    return {
      success: false,
      message:
        `Compte destination : ${toResult.message}`,
    };
  }

  if (
    String(fromResult.account._id) ===
    String(toResult.account._id)
  ) {
    return {
      success: false,
      message:
        "Le compte source et le compte destination doivent être différents.",
    };
  }

  if (
    fromResult.account.currency !==
    toResult.account.currency
  ) {
    return {
      success: false,
      message:
        "Les transferts entre deux devises différentes ne sont pas encore autorisés. Le module de change sera ajouté séparément.",
    };
  }

  if (
    fromResult.account.currency !==
    normalizedCurrency
  ) {
    return {
      success: false,
      message:
        `La transaction est en ${normalizedCurrency}, ` +
        `mais les comptes utilisent ${fromResult.account.currency}.`,
    };
  }

  return {
    success: true,
    amount: numericAmount,
    currency: normalizedCurrency,
    fromAccount: fromResult.account,
    toAccount: toResult.account,
  };
};

// ======================================================
// ERREUR SOLDE INSUFFISANT
// ======================================================

const createInsufficientBalanceError = ({
  accountName,
  currentBalance,
  amount,
  currency,
}) => {
  const error = new Error(
    `Solde insuffisant sur le compte « ${accountName} ». ` +
      `Solde disponible : ${roundMoney(
        currentBalance
      )} ${currency}. ` +
      `Montant demandé : ${roundMoney(
        amount
      )} ${currency}.`
  );

  error.code = "INSUFFICIENT_BALANCE";
  error.statusCode = 409;

  return error;
};

// ======================================================
// FILTRE ATOMIQUE DE DÉBIT
// ======================================================

const buildDebitFilter = ({
  accountId,
  churchId,
  amount,
}) => ({
  _id: accountId,
  church: churchId,
  isActive: true,

  $or: [
    {
      allowNegativeBalance: true,
    },
    {
      allowNegativeBalance: {
        $exists: false,
      },
      currentBalance: {
        $gte: amount,
      },
    },
    {
      allowNegativeBalance: false,
      currentBalance: {
        $gte: amount,
      },
    },
  ],
});

// ======================================================
// DÉBIT ATOMIQUE
// ======================================================

const debitAccount = async ({
  accountId,
  churchId,
  amount,
}) => {
  const numericAmount = Number(amount);

  const result =
    await FinanceAccount.findOneAndUpdate(
      buildDebitFilter({
        accountId,
        churchId,
        amount: numericAmount,
      }),
      {
        $inc: {
          currentBalance: -numericAmount,
        },
      },
      {
        new: true,
      }
    );

  if (result) {
    return result;
  }

  const account =
    await FinanceAccount.findOne({
      _id: accountId,
      church: churchId,
    });

  if (!account) {
    throw new Error(
      "Compte financier introuvable."
    );
  }

  if (!account.isActive) {
    throw new Error(
      `Le compte « ${account.name} » est désactivé.`
    );
  }

  if (
    account.allowNegativeBalance !== true &&
    Number(account.currentBalance) <
      numericAmount
  ) {
    throw createInsufficientBalanceError({
      accountName: account.name,
      currentBalance:
        account.currentBalance,
      amount: numericAmount,
      currency: account.currency,
    });
  }

  throw new Error(
    `Impossible de débiter le compte « ${account.name} ».`
  );
};

// ======================================================
// APPLIQUER MOUVEMENT
// ======================================================

const applyBalanceMovement = async (
  transaction
) => {
  const churchId = transaction.church;
  const amount = Number(transaction.amount);

  // ENTRÉE

  if (transaction.type === "income") {
    const result =
      await FinanceAccount.findOneAndUpdate(
        {
          _id: transaction.account,
          church: churchId,
          isActive: true,
        },
        {
          $inc: {
            currentBalance: amount,
          },
        },
        {
          new: true,
        }
      );

    if (!result) {
      throw new Error(
        "Impossible de créditer le compte financier."
      );
    }

    return;
  }

  // SORTIE

  if (transaction.type === "expense") {
    await debitAccount({
      accountId: transaction.account,
      churchId,
      amount,
    });

    return;
  }

  // TRANSFERT

  if (transaction.type === "transfer") {
    await debitAccount({
      accountId:
        transaction.fromAccount,
      churchId,
      amount,
    });

    try {
      const destinationResult =
        await FinanceAccount.findOneAndUpdate(
          {
            _id: transaction.toAccount,
            church: churchId,
            isActive: true,
          },
          {
            $inc: {
              currentBalance: amount,
            },
          },
          {
            new: true,
          }
        );

      if (!destinationResult) {
        throw new Error(
          "Impossible de créditer le compte destination."
        );
      }
    } catch (error) {
      await FinanceAccount.updateOne(
        {
          _id: transaction.fromAccount,
          church: churchId,
        },
        {
          $inc: {
            currentBalance: amount,
          },
        }
      );

      throw error;
    }
  }
};

// ======================================================
// INVERSER MOUVEMENT
// ======================================================

const reverseBalanceMovement = async (
  transaction
) => {
  const churchId = transaction.church;
  const amount = Number(transaction.amount);

  // ANNULATION ENTRÉE

  if (transaction.type === "income") {
    const result =
      await FinanceAccount.findOneAndUpdate(
        {
          _id: transaction.account,
          church: churchId,
        },
        {
          $inc: {
            currentBalance: -amount,
          },
        },
        {
          new: true,
        }
      );

    if (!result) {
      throw new Error(
        "Impossible d'annuler le crédit du compte financier."
      );
    }

    return;
  }

  // ANNULATION SORTIE

  if (transaction.type === "expense") {
    const result =
      await FinanceAccount.findOneAndUpdate(
        {
          _id: transaction.account,
          church: churchId,
        },
        {
          $inc: {
            currentBalance: amount,
          },
        },
        {
          new: true,
        }
      );

    if (!result) {
      throw new Error(
        "Impossible d'annuler le débit du compte financier."
      );
    }

    return;
  }

  // ANNULATION TRANSFERT

  if (transaction.type === "transfer") {
    const destinationResult =
      await FinanceAccount.findOneAndUpdate(
        {
          _id: transaction.toAccount,
          church: churchId,
        },
        {
          $inc: {
            currentBalance: -amount,
          },
        },
        {
          new: true,
        }
      );

    if (!destinationResult) {
      throw new Error(
        "Impossible d'annuler le crédit du compte destination."
      );
    }

    try {
      const sourceResult =
        await FinanceAccount.findOneAndUpdate(
          {
            _id: transaction.fromAccount,
            church: churchId,
          },
          {
            $inc: {
              currentBalance: amount,
            },
          },
          {
            new: true,
          }
        );

      if (!sourceResult) {
        throw new Error(
          "Impossible de restaurer le compte source."
        );
      }
    } catch (error) {
      await FinanceAccount.updateOne(
        {
          _id: transaction.toAccount,
          church: churchId,
        },
        {
          $inc: {
            currentBalance: amount,
          },
        }
      );

      throw error;
    }
  }
};// ======================================================
// GET ALL
// ======================================================

const getFinanceTransactions = async (
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
      type,
      status,
      category,
      account,
      member,
      paymentMethod,
      currency,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const numericPage = Math.max(
      parseInt(page, 10) || 1,
      1
    );

    const numericLimit = Math.min(
      Math.max(
        parseInt(limit, 10) || 50,
        1
      ),
      500
    );

    const filter = {
      church: churchId,
    };

    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message:
            "Type de transaction invalide.",
        });
      }

      filter.type = type;
    }

    if (status) {
      if (
        !VALID_STATUSES.includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Statut de transaction invalide.",
        });
      }

      filter.status = status;
    }

    if (category) {
      if (!isValidObjectId(category)) {
        return res.status(400).json({
          success: false,
          message: "Catégorie invalide.",
        });
      }

      filter.category = category;
    }

    if (member) {
      if (!isValidObjectId(member)) {
        return res.status(400).json({
          success: false,
          message: "Membre invalide.",
        });
      }

      filter.member = member;
    }

    if (paymentMethod) {
      if (
        !VALID_PAYMENT_METHODS.includes(
          paymentMethod
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Moyen de paiement invalide.",
        });
      }

      filter.paymentMethod =
        paymentMethod;
    }

    if (currency) {
      filter.currency =
        normalizeCurrency(currency);
    }

    if (account) {
      if (!isValidObjectId(account)) {
        return res.status(400).json({
          success: false,
          message:
            "Compte financier invalide.",
        });
      }

      filter.$or = [
        { account },
        { fromAccount: account },
        { toAccount: account },
      ];
    }

    if (startDate || endDate) {
      filter.transactionDate = {};

      if (startDate) {
        const parsedStartDate =
          new Date(startDate);

        if (
          Number.isNaN(
            parsedStartDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Date de début invalide.",
          });
        }

        filter.transactionDate.$gte =
          parsedStartDate;
      }

      if (endDate) {
        const parsedEndDate =
          new Date(endDate);

        if (
          Number.isNaN(
            parsedEndDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Date de fin invalide.",
          });
        }

        parsedEndDate.setHours(
          23,
          59,
          59,
          999
        );

        filter.transactionDate.$lte =
          parsedEndDate;
      }
    }

    if (search && search.trim()) {
      const regex = new RegExp(
        escapeRegex(search.trim()),
        "i"
      );

      const searchConditions = [
        { title: regex },
        { description: regex },
        { reference: regex },
        { receiptNumber: regex },
        { donorName: regex },
        { note: regex },
      ];

      if (filter.$or) {
        filter.$and = [
          {
            $or: filter.$or,
          },
          {
            $or: searchConditions,
          },
        ];

        delete filter.$or;
      } else {
        filter.$or =
          searchConditions;
      }
    }

    const [transactions, total] =
      await Promise.all([
        FinanceTransaction.find(filter)
          .populate(
            "category",
            "name type code color icon"
          )
          .populate(
            "account",
            "name type currency currentBalance allowNegativeBalance"
          )
          .populate(
            "fromAccount",
            "name type currency currentBalance allowNegativeBalance"
          )
          .populate(
            "toAccount",
            "name type currency currentBalance allowNegativeBalance"
          )
          .populate(
            "member",
            "firstName lastName name email phone"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .populate(
            "updatedBy",
            "name email"
          )
          .populate(
            "cancelledBy",
            "name email"
          )
          .sort({
            transactionDate: -1,
            createdAt: -1,
          })
          .skip(
            (numericPage - 1) *
              numericLimit
          )
          .limit(numericLimit),

        FinanceTransaction.countDocuments(
          filter
        ),
      ]);

    return res.status(200).json({
      success: true,
      data: transactions,
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
      "Erreur getFinanceTransactions :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer les transactions financières.",
    });
  }
};

// ======================================================
// GET ONE
// ======================================================

const getFinanceTransactionById =
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

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Identifiant de transaction invalide.",
        });
      }

      const transaction =
        await FinanceTransaction.findOne({
          _id: id,
          church: churchId,
        });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message:
            "Transaction financière introuvable.",
        });
      }

      await populateTransaction(
        transaction
      );

      return res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      console.error(
        "Erreur getFinanceTransactionById :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de récupérer cette transaction financière.",
      });
    }
  };

// ======================================================
// CREATE
// ======================================================

const createFinanceTransaction =
  async (req, res) => {
    let createdTransaction = null;

    try {
      const churchId =
        getChurchId(req);

      if (!churchId) {
        return res.status(400).json({
          success: false,
          message:
            "Église active introuvable.",
        });
      }

      const {
        type,
        amount,
        currency = "EUR",
        transactionDate = new Date(),
        category = null,
        account = null,
        fromAccount = null,
        toAccount = null,
        member = null,
        donorName = "",
        isAnonymous = false,
        title,
        description = "",
        reference = "",
        paymentMethod = "cash",
        status = "confirmed",
        receiptNumber = "",
        attachmentUrl = "",
        note = "",
      } = req.body;

      if (
        !title ||
        !String(title).trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Le libellé de la transaction est obligatoire.",
        });
      }

      if (
        !["draft", "confirmed"].includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Une nouvelle transaction doit être en brouillon ou confirmée.",
        });
      }

      const parsedDate =
        new Date(transactionDate);

      if (
        Number.isNaN(
          parsedDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Date de transaction invalide.",
        });
      }

      const validation =
        await validateTransactionData({
          churchId,
          type,
          amount,
          currency,
          category,
          account,
          fromAccount,
          toAccount,
          member,
          isAnonymous,
          paymentMethod,
        });

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: validation.message,
        });
      }

      const anonymous =
        type === "income"
          ? normalizeBoolean(
              isAnonymous
            )
          : false;

      const transactionData = {
        church: churchId,
        type,
        amount: validation.amount,
        currency:
          validation.currency,
        transactionDate:
          parsedDate,
        title: String(title).trim(),
        description,
        reference,
        paymentMethod,
        status,
        receiptNumber,
        attachmentUrl,
        note,
        createdBy:
          req.user?._id || null,
        updatedBy:
          req.user?._id || null,
      };

      if (
        type === "income" ||
        type === "expense"
      ) {
        transactionData.account =
          validation.account._id;

        transactionData.category =
          validation.category._id;
      }

      if (type === "income") {
        transactionData.isAnonymous =
          anonymous;

        if (anonymous) {
          transactionData.member = null;
          transactionData.donorName =
            "";
        } else {
          transactionData.member =
            validation.member?._id ||
            null;

          transactionData.donorName =
            donorName;
        }
      } else {
        transactionData.member = null;
        transactionData.donorName =
          "";
        transactionData.isAnonymous =
          false;
      }

      if (type === "transfer") {
        transactionData.fromAccount =
          validation.fromAccount._id;

        transactionData.toAccount =
          validation.toAccount._id;

        transactionData.account = null;
        transactionData.category =
          null;
        transactionData.member = null;
        transactionData.donorName =
          "";
        transactionData.isAnonymous =
          false;
        transactionData.paymentMethod =
          "bank_transfer";
      }

      createdTransaction =
        await FinanceTransaction.create(
          transactionData
        );

      if (status === "confirmed") {
        try {
          await applyBalanceMovement(
            createdTransaction
          );
        } catch (balanceError) {
          await FinanceTransaction.deleteOne(
            {
              _id:
                createdTransaction._id,
              church: churchId,
            }
          );

          createdTransaction = null;

          throw balanceError;
        }
      }

      await populateTransaction(
        createdTransaction
      );

      return res.status(201).json({
        success: true,
        message:
          status === "confirmed"
            ? "Transaction financière enregistrée et confirmée avec succès."
            : "Brouillon financier créé avec succès.",
        data: createdTransaction,
      });
    } catch (error) {
      console.error(
        "Erreur createFinanceTransaction :",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "La référence ou le numéro de reçu est déjà utilisé pour cette église.",
        });
      }

      if (
        error?.code ===
        "INSUFFICIENT_BALANCE"
      ) {
        return res.status(409).json({
          success: false,
          message: error.message,
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
            "Données de transaction invalides.",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Impossible d'enregistrer la transaction financière.",
      });
    }
  };

// ======================================================
// UPDATE BROUILLON
// ======================================================

const updateFinanceTransaction =
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

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Identifiant de transaction invalide.",
        });
      }

      const transaction =
        await FinanceTransaction.findOne({
          _id: id,
          church: churchId,
        });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message:
            "Transaction financière introuvable.",
        });
      }

      if (
        transaction.status !== "draft"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Une transaction confirmée ou annulée ne peut pas être modifiée.",
        });
      }

      const mergedData = {
        type:
          req.body.type ??
          transaction.type,

        amount:
          req.body.amount ??
          transaction.amount,

        currency:
          req.body.currency ??
          transaction.currency,

        category:
          req.body.category ??
          transaction.category,

        account:
          req.body.account ??
          transaction.account,

        fromAccount:
          req.body.fromAccount ??
          transaction.fromAccount,

        toAccount:
          req.body.toAccount ??
          transaction.toAccount,

        member:
          req.body.member ??
          transaction.member,

        isAnonymous:
          req.body.isAnonymous ??
          transaction.isAnonymous,

        paymentMethod:
          req.body.paymentMethod ??
          transaction.paymentMethod,
      };

      const validation =
        await validateTransactionData({
          churchId,
          ...mergedData,
        });

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: validation.message,
        });
      }

      if (
        req.body.transactionDate !==
        undefined
      ) {
        const parsedDate =
          new Date(
            req.body.transactionDate
          );

        if (
          Number.isNaN(
            parsedDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Date de transaction invalide.",
          });
        }

        transaction.transactionDate =
          parsedDate;
      }

      if (
        req.body.title !== undefined
      ) {
        if (
          !String(
            req.body.title
          ).trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Le libellé de la transaction est obligatoire.",
          });
        }

        transaction.title =
          String(
            req.body.title
          ).trim();
      }

      transaction.type =
        mergedData.type;

      transaction.amount =
        validation.amount;

      transaction.currency =
        validation.currency;

      if (
        transaction.type ===
          "income" ||
        transaction.type ===
          "expense"
      ) {
        transaction.account =
          validation.account._id;

        transaction.category =
          validation.category._id;

        transaction.fromAccount =
          null;

        transaction.toAccount =
          null;
      }

      if (
        transaction.type ===
        "transfer"
      ) {
        transaction.account = null;
        transaction.category = null;

        transaction.fromAccount =
          validation.fromAccount._id;

        transaction.toAccount =
          validation.toAccount._id;

        transaction.member = null;
        transaction.donorName = "";
        transaction.isAnonymous =
          false;

        transaction.paymentMethod =
          "bank_transfer";
      } else {
        transaction.paymentMethod =
          mergedData.paymentMethod;
      }

      if (
        transaction.type ===
        "income"
      ) {
        const anonymous =
          normalizeBoolean(
            mergedData.isAnonymous
          );

        transaction.isAnonymous =
          anonymous;

        if (anonymous) {
          transaction.member = null;
          transaction.donorName =
            "";
        } else {
          transaction.member =
            validation.member?._id ||
            null;

          if (
            req.body.donorName !==
            undefined
          ) {
            transaction.donorName =
              req.body.donorName;
          }
        }
      }

      if (
        transaction.type ===
        "expense"
      ) {
        transaction.member = null;
        transaction.donorName = "";
        transaction.isAnonymous =
          false;
      }

      const optionalFields = [
        "description",
        "reference",
        "receiptNumber",
        "attachmentUrl",
        "note",
      ];

      for (
        const field of optionalFields
      ) {
        if (
          req.body[field] !==
          undefined
        ) {
          transaction[field] =
            req.body[field];
        }
      }

      transaction.updatedBy =
        req.user?._id || null;

      await transaction.save();

      await populateTransaction(
        transaction
      );

      return res.status(200).json({
        success: true,
        message:
          "Brouillon financier mis à jour avec succès.",
        data: transaction,
      });
    } catch (error) {
      console.error(
        "Erreur updateFinanceTransaction :",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "La référence ou le numéro de reçu est déjà utilisé.",
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
            "Données de transaction invalides.",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Impossible de modifier le brouillon financier.",
      });
    }
  };// ======================================================
  // CONFIRMER / RÉACTIVER
  // PATCH /api/finance/transactions/:id/confirm
  //
  // draft     -> confirmed
  // cancelled -> confirmed
  //
  // Le mouvement financier est appliqué exactement une fois.
  // ======================================================
  
  const confirmFinanceTransaction = async (
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
            "Identifiant de transaction invalide.",
        });
      }
  
      const transaction =
        await FinanceTransaction.findOne({
          _id: id,
          church: churchId,
        });
  
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message:
            "Transaction financière introuvable.",
        });
      }
  
      if (
        transaction.status === "confirmed"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Cette transaction est déjà confirmée.",
        });
      }
  
      if (
        !["draft", "cancelled"].includes(
          transaction.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Le statut actuel de cette transaction ne permet pas sa confirmation.",
        });
      }
  
      const previousStatus =
        transaction.status;
  
      // Revalidation avant application du mouvement
      const validation =
        await validateTransactionData({
          churchId,
          type: transaction.type,
          amount: transaction.amount,
          currency: transaction.currency,
          category: transaction.category,
          account: transaction.account,
          fromAccount:
            transaction.fromAccount,
          toAccount: transaction.toAccount,
          member: transaction.member,
          isAnonymous:
            transaction.isAnonymous,
          paymentMethod:
            transaction.paymentMethod,
        });
  
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: validation.message,
        });
      }
  
      // Verrouillage atomique du statut
      const claimed =
        await FinanceTransaction.findOneAndUpdate(
          {
            _id: transaction._id,
            church: churchId,
            status: previousStatus,
          },
          {
            $set: {
              status: "confirmed",
              cancelledAt: null,
              cancelledBy: null,
              cancellationReason: "",
              updatedBy:
                req.user?._id || null,
            },
          },
          {
            new: true,
          }
        );
  
      if (!claimed) {
        return res.status(409).json({
          success: false,
          message:
            "La transaction a déjà été traitée.",
        });
      }
  
      try {
        await applyBalanceMovement(claimed);
      } catch (balanceError) {
        const rollbackData = {
          status: previousStatus,
        };
  
        if (
          previousStatus === "cancelled"
        ) {
          rollbackData.cancelledAt =
            transaction.cancelledAt ||
            new Date();
  
          rollbackData.cancelledBy =
            transaction.cancelledBy ||
            null;
  
          rollbackData.cancellationReason =
            transaction.cancellationReason ||
            "";
        } else {
          rollbackData.cancelledAt = null;
          rollbackData.cancelledBy = null;
          rollbackData.cancellationReason =
            "";
        }
  
        await FinanceTransaction.updateOne(
          {
            _id: claimed._id,
            church: churchId,
            status: "confirmed",
          },
          {
            $set: rollbackData,
          }
        );
  
        throw balanceError;
      }
  
      await populateTransaction(claimed);
  
      return res.status(200).json({
        success: true,
        message:
          previousStatus === "cancelled"
            ? "Transaction réactivée avec succès. Le mouvement financier a été restauré."
            : "Transaction financière confirmée avec succès.",
        data: claimed,
      });
    } catch (error) {
      console.error(
        "Erreur confirmFinanceTransaction :",
        error
      );
  
      if (
        error?.code ===
        "INSUFFICIENT_BALANCE"
      ) {
        return res.status(409).json({
          success: false,
          message: error.message,
        });
      }
  
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Impossible de confirmer ou réactiver la transaction financière.",
      });
    }
  };
  
  // ======================================================
  // ANNULER
  // PATCH /api/finance/transactions/:id/cancel
  // ======================================================
  
  const cancelFinanceTransaction = async (
    req,
    res
  ) => {
    try {
      const churchId = getChurchId(req);
      const { id } = req.params;
  
      const {
        cancellationReason = "",
      } = req.body;
  
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
            "Identifiant de transaction invalide.",
        });
      }
  
      const transaction =
        await FinanceTransaction.findOne({
          _id: id,
          church: churchId,
        });
  
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message:
            "Transaction financière introuvable.",
        });
      }
  
      if (
        transaction.status === "cancelled"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Cette transaction est déjà annulée.",
        });
      }
  
      // ==================================================
      // BROUILLON
      // Aucun mouvement financier à inverser
      // ==================================================
  
      if (
        transaction.status === "draft"
      ) {
        transaction.status = "cancelled";
  
        transaction.cancelledAt =
          new Date();
  
        transaction.cancelledBy =
          req.user?._id || null;
  
        transaction.cancellationReason =
          String(
            cancellationReason || ""
          ).trim();
  
        transaction.updatedBy =
          req.user?._id || null;
  
        await transaction.save();
  
        await populateTransaction(
          transaction
        );
  
        return res.status(200).json({
          success: true,
          message:
            "Brouillon financier annulé avec succès.",
          data: transaction,
        });
      }
  
      // ==================================================
      // CONFIRMÉE
      // Verrouillage puis inversion du mouvement
      // ==================================================
  
      const cancelledAt = new Date();
  
      const claimed =
        await FinanceTransaction.findOneAndUpdate(
          {
            _id: transaction._id,
            church: churchId,
            status: "confirmed",
          },
          {
            $set: {
              status: "cancelled",
  
              cancelledAt,
  
              cancelledBy:
                req.user?._id || null,
  
              cancellationReason:
                String(
                  cancellationReason || ""
                ).trim(),
  
              updatedBy:
                req.user?._id || null,
            },
          },
          {
            new: true,
          }
        );
  
      if (!claimed) {
        return res.status(409).json({
          success: false,
          message:
            "La transaction a déjà été traitée.",
        });
      }
  
      try {
        await reverseBalanceMovement(
          claimed
        );
      } catch (balanceError) {
        // Restaurer le statut si l'inversion
        // du mouvement financier échoue.
  
        await FinanceTransaction.updateOne(
          {
            _id: claimed._id,
            church: churchId,
            status: "cancelled",
          },
          {
            $set: {
              status: "confirmed",
              cancelledAt: null,
              cancelledBy: null,
              cancellationReason: "",
            },
          }
        );
  
        throw balanceError;
      }
  
      await populateTransaction(claimed);
  
      return res.status(200).json({
        success: true,
        message:
          "Transaction financière annulée et soldes restaurés avec succès.",
        data: claimed,
      });
    } catch (error) {
      console.error(
        "Erreur cancelFinanceTransaction :",
        error
      );
  
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Impossible d'annuler la transaction financière.",
      });
    }
  };
  
  // ======================================================
  // SUPPRIMER TRANSACTION
  // DELETE /api/finance/transactions/:id
  //
  // draft     -> suppression directe
  // cancelled -> suppression directe
  // confirmed -> inversion du mouvement puis suppression
  //
  // Important :
  // une transaction annulée a déjà eu son mouvement inversé.
  // Il ne faut donc PAS modifier le solde une seconde fois.
  // ======================================================
  
  const deleteFinanceTransaction = async (
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
            "Identifiant de transaction invalide.",
        });
      }
  
      const transaction =
        await FinanceTransaction.findOne({
          _id: id,
          church: churchId,
        });
  
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message:
            "Transaction financière introuvable.",
        });
      }
  
      const originalStatus =
        transaction.status;
  
      // ==================================================
      // BROUILLON / ANNULÉE
      // Aucun mouvement financier à modifier.
      // ==================================================
  
      if (
        originalStatus === "draft" ||
        originalStatus === "cancelled"
      ) {
        const deleteResult =
          await FinanceTransaction.deleteOne({
            _id: transaction._id,
            church: churchId,
            status: originalStatus,
          });
  
        if (
          !deleteResult ||
          deleteResult.deletedCount !== 1
        ) {
          return res.status(409).json({
            success: false,
            message:
              "La transaction a déjà été modifiée ou supprimée.",
          });
        }
  
        return res.status(200).json({
          success: true,
          message:
            originalStatus === "draft"
              ? "Brouillon financier supprimé avec succès."
              : "Transaction annulée supprimée définitivement avec succès.",
        });
      }
  
      // ==================================================
      // CONFIRMÉE
      //
      // 1. On prend possession de la transaction en la
      //    passant temporairement à cancelled.
      // 2. On inverse son mouvement financier.
      // 3. On la supprime.
      // 4. Si la suppression échoue, on réapplique
      //    le mouvement et on restaure confirmed.
      // ==================================================
  
      if (originalStatus === "confirmed") {
        const claimed =
          await FinanceTransaction.findOneAndUpdate(
            {
              _id: transaction._id,
              church: churchId,
              status: "confirmed",
            },
            {
              $set: {
                status: "cancelled",
  
                cancelledAt: new Date(),
  
                cancelledBy:
                  req.user?._id || null,
  
                cancellationReason:
                  "Suppression définitive d'une transaction confirmée.",
  
                updatedBy:
                  req.user?._id || null,
              },
            },
            {
              new: true,
            }
          );
  
        if (!claimed) {
          return res.status(409).json({
            success: false,
            message:
              "La transaction a déjà été traitée.",
          });
        }
  
        // ----------------------------------------------
        // INVERSER LE MOUVEMENT
        // ----------------------------------------------
  
        try {
          await reverseBalanceMovement(
            claimed
          );
        } catch (balanceError) {
          // Le mouvement n'a pas pu être inversé.
          // On restaure le statut confirmed.
  
          await FinanceTransaction.updateOne(
            {
              _id: claimed._id,
              church: churchId,
              status: "cancelled",
            },
            {
              $set: {
                status: "confirmed",
                cancelledAt: null,
                cancelledBy: null,
                cancellationReason: "",
                updatedBy:
                  req.user?._id || null,
              },
            }
          );
  
          throw balanceError;
        }
  
        // ----------------------------------------------
        // SUPPRIMER LA TRANSACTION
        // ----------------------------------------------
  
        try {
          const deleteResult =
            await FinanceTransaction.deleteOne({
              _id: claimed._id,
              church: churchId,
              status: "cancelled",
            });
  
          if (
            !deleteResult ||
            deleteResult.deletedCount !== 1
          ) {
            throw new Error(
              "La suppression définitive de la transaction a échoué."
            );
          }
        } catch (deleteError) {
          // --------------------------------------------
          // COMPENSATION
          //
          // Le mouvement avait déjà été inversé.
          // Puisque la transaction n'a pas été supprimée,
          // on doit remettre exactement le mouvement
          // financier initial.
          // --------------------------------------------
  
          try {
            await applyBalanceMovement(
              claimed
            );
  
            await FinanceTransaction.updateOne(
              {
                _id: claimed._id,
                church: churchId,
                status: "cancelled",
              },
              {
                $set: {
                  status: "confirmed",
                  cancelledAt: null,
                  cancelledBy: null,
                  cancellationReason: "",
                  updatedBy:
                    req.user?._id || null,
                },
              }
            );
          } catch (
            compensationError
          ) {
            console.error(
              "ERREUR CRITIQUE compensation suppression transaction :",
              compensationError
            );
  
            return res.status(500).json({
              success: false,
              message:
                "Erreur critique pendant la suppression. Une vérification du rapprochement financier est nécessaire.",
            });
          }
  
          throw deleteError;
        }
  
        return res.status(200).json({
          success: true,
          message:
            "Transaction confirmée supprimée avec succès. Le mouvement financier a été retiré du solde.",
        });
      }
  
      return res.status(409).json({
        success: false,
        message:
          "Le statut de cette transaction ne permet pas sa suppression.",
      });
    } catch (error) {
      console.error(
        "Erreur deleteFinanceTransaction :",
        error
      );
  
      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Impossible de supprimer la transaction financière.",
      });
    }
  };
  
  // ======================================================
  // STATISTIQUES
  // ======================================================
  
  const getFinanceTransactionStats =
    async (req, res) => {
      try {
        const churchId =
          getChurchId(req);
  
        if (!churchId) {
          return res.status(400).json({
            success: false,
            message:
              "Église active introuvable.",
          });
        }
  
        const {
          startDate,
          endDate,
          currency,
        } = req.query;
  
        const match = {
          church:
            new mongoose.Types.ObjectId(
              churchId
            ),
  
          status: "confirmed",
        };
  
        if (currency) {
          match.currency =
            normalizeCurrency(currency);
        }
  
        if (startDate || endDate) {
          match.transactionDate = {};
  
          if (startDate) {
            const parsedStartDate =
              new Date(startDate);
  
            if (
              Number.isNaN(
                parsedStartDate.getTime()
              )
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "Date de début invalide.",
              });
            }
  
            match.transactionDate.$gte =
              parsedStartDate;
          }
  
          if (endDate) {
            const parsedEndDate =
              new Date(endDate);
  
            if (
              Number.isNaN(
                parsedEndDate.getTime()
              )
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "Date de fin invalide.",
              });
            }
  
            parsedEndDate.setHours(
              23,
              59,
              59,
              999
            );
  
            match.transactionDate.$lte =
              parsedEndDate;
          }
        }
  
        const result =
          await FinanceTransaction.aggregate([
            {
              $match: match,
            },
            {
              $group: {
                _id: {
                  currency: "$currency",
                  type: "$type",
                },
  
                totalAmount: {
                  $sum: "$amount",
                },
  
                count: {
                  $sum: 1,
                },
              },
            },
          ]);
  
        const byCurrency = {};
  
        for (const item of result) {
          const currencyCode =
            item._id.currency;
  
          if (
            !byCurrency[currencyCode]
          ) {
            byCurrency[currencyCode] = {
              income: 0,
              expense: 0,
              transfer: 0,
  
              incomeCount: 0,
              expenseCount: 0,
              transferCount: 0,
  
              net: 0,
            };
          }
  
          if (
            item._id.type === "income"
          ) {
            byCurrency[
              currencyCode
            ].income = item.totalAmount;
  
            byCurrency[
              currencyCode
            ].incomeCount = item.count;
          }
  
          if (
            item._id.type === "expense"
          ) {
            byCurrency[
              currencyCode
            ].expense = item.totalAmount;
  
            byCurrency[
              currencyCode
            ].expenseCount = item.count;
          }
  
          if (
            item._id.type === "transfer"
          ) {
            byCurrency[
              currencyCode
            ].transfer = item.totalAmount;
  
            byCurrency[
              currencyCode
            ].transferCount = item.count;
          }
        }
  
        for (
          const currencyCode of
          Object.keys(byCurrency)
        ) {
          byCurrency[
            currencyCode
          ].net =
            byCurrency[
              currencyCode
            ].income -
            byCurrency[
              currencyCode
            ].expense;
        }
  
        return res.status(200).json({
          success: true,
          data: {
            byCurrency,
          },
        });
      } catch (error) {
        console.error(
          "Erreur getFinanceTransactionStats :",
          error
        );
  
        return res.status(500).json({
          success: false,
          message:
            "Impossible de récupérer les statistiques financières.",
        });
      }
    };
  
  // ======================================================
  // EXPORTS
  // ======================================================
  
  module.exports = {
    getFinanceTransactions,
    getFinanceTransactionById,
    createFinanceTransaction,
    updateFinanceTransaction,
    confirmFinanceTransaction,
    cancelFinanceTransaction,
    deleteFinanceTransaction,
    getFinanceTransactionStats,
  };