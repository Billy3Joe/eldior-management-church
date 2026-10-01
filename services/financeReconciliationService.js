const mongoose = require("mongoose");

const FinanceAccount = require("../models/FinanceAccount");
const FinanceTransaction = require("../models/FinanceTransaction");

// ======================================================
// HELPERS
// ======================================================

const toObjectId = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(String(value));
};

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

// ======================================================
// CALCUL DES MOUVEMENTS D'UN COMPTE
// ======================================================

const calculateAccountMovements = async ({
  churchId,
  accountId,
  currency,
}) => {
  const churchObjectId = toObjectId(churchId);
  const accountObjectId = toObjectId(accountId);

  if (!churchObjectId) {
    throw new Error("Identifiant d'église invalide.");
  }

  if (!accountObjectId) {
    throw new Error("Identifiant de compte financier invalide.");
  }

  const normalizedCurrency = String(currency || "")
    .trim()
    .toUpperCase();

  // ====================================================
  // ENTRÉES
  // ====================================================

  const incomeResult = await FinanceTransaction.aggregate([
    {
      $match: {
        church: churchObjectId,
        account: accountObjectId,
        type: "income",
        status: "confirmed",
        currency: normalizedCurrency,
      },
    },
    {
      $group: {
        _id: null,
        amount: {
          $sum: "$amount",
        },
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  // ====================================================
  // DÉPENSES
  // ====================================================

  const expenseResult = await FinanceTransaction.aggregate([
    {
      $match: {
        church: churchObjectId,
        account: accountObjectId,
        type: "expense",
        status: "confirmed",
        currency: normalizedCurrency,
      },
    },
    {
      $group: {
        _id: null,
        amount: {
          $sum: "$amount",
        },
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  // ====================================================
  // TRANSFERTS ENTRANTS
  // ====================================================

  const transferInResult = await FinanceTransaction.aggregate([
    {
      $match: {
        church: churchObjectId,
        toAccount: accountObjectId,
        type: "transfer",
        status: "confirmed",
        currency: normalizedCurrency,
      },
    },
    {
      $group: {
        _id: null,
        amount: {
          $sum: "$amount",
        },
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  // ====================================================
  // TRANSFERTS SORTANTS
  // ====================================================

  const transferOutResult = await FinanceTransaction.aggregate([
    {
      $match: {
        church: churchObjectId,
        fromAccount: accountObjectId,
        type: "transfer",
        status: "confirmed",
        currency: normalizedCurrency,
      },
    },
    {
      $group: {
        _id: null,
        amount: {
          $sum: "$amount",
        },
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  const income = roundMoney(
    incomeResult[0]?.amount || 0
  );

  const expense = roundMoney(
    expenseResult[0]?.amount || 0
  );

  const transferIn = roundMoney(
    transferInResult[0]?.amount || 0
  );

  const transferOut = roundMoney(
    transferOutResult[0]?.amount || 0
  );

  return {
    income: {
      amount: income,
      count: incomeResult[0]?.count || 0,
    },

    expense: {
      amount: expense,
      count: expenseResult[0]?.count || 0,
    },

    transferIn: {
      amount: transferIn,
      count: transferInResult[0]?.count || 0,
    },

    transferOut: {
      amount: transferOut,
      count: transferOutResult[0]?.count || 0,
    },

    netMovement: roundMoney(
      income +
        transferIn -
        expense -
        transferOut
    ),
  };
};

// ======================================================
// RÉCONCILIATION D'UN COMPTE
// ======================================================

const reconcileAccount = async ({
  churchId,
  accountId,
}) => {
  const churchObjectId = toObjectId(churchId);
  const accountObjectId = toObjectId(accountId);

  if (!churchObjectId) {
    throw new Error("Identifiant d'église invalide.");
  }

  if (!accountObjectId) {
    throw new Error("Identifiant de compte financier invalide.");
  }

  const account = await FinanceAccount.findOne({
    _id: accountObjectId,
    church: churchObjectId,
  }).lean();

  if (!account) {
    return null;
  }

  const movements = await calculateAccountMovements({
    churchId: churchObjectId,
    accountId: accountObjectId,
    currency: account.currency,
  });

  const openingBalance = roundMoney(
    account.openingBalance || 0
  );

  const storedBalance = roundMoney(
    account.currentBalance || 0
  );

  const theoreticalBalance = roundMoney(
    openingBalance + movements.netMovement
  );

  const difference = roundMoney(
    storedBalance - theoreticalBalance
  );

  const isBalanced = Math.abs(difference) < 0.01;

  return {
    account: {
      _id: account._id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      isActive: account.isActive,
      isDefault: account.isDefault,
    },

    openingBalance,

    movements,

    theoreticalBalance,
    storedBalance,

    difference,

    isBalanced,

    status: isBalanced
      ? "balanced"
      : "discrepancy",
  };
};

// ======================================================
// RÉCONCILIATION DE TOUS LES COMPTES D'UNE ÉGLISE
// ======================================================

const reconcileChurchAccounts = async ({
  churchId,
}) => {
  const churchObjectId = toObjectId(churchId);

  if (!churchObjectId) {
    throw new Error("Identifiant d'église invalide.");
  }

  const accounts = await FinanceAccount.find({
    church: churchObjectId,
  })
    .select("_id")
    .sort({
      isDefault: -1,
      sortOrder: 1,
      name: 1,
    })
    .lean();

  const results = [];

  for (const account of accounts) {
    const reconciliation = await reconcileAccount({
      churchId: churchObjectId,
      accountId: account._id,
    });

    if (reconciliation) {
      results.push(reconciliation);
    }
  }

  const discrepancies = results.filter(
    (item) => !item.isBalanced
  );

  const currencies = {};

  for (const item of results) {
    const currency = item.account.currency;

    if (!currencies[currency]) {
      currencies[currency] = {
        openingBalance: 0,
        income: 0,
        expense: 0,
        transferIn: 0,
        transferOut: 0,
        theoreticalBalance: 0,
        storedBalance: 0,
        difference: 0,
      };
    }

    const summary = currencies[currency];

    summary.openingBalance = roundMoney(
      summary.openingBalance +
        item.openingBalance
    );

    summary.income = roundMoney(
      summary.income +
        item.movements.income.amount
    );

    summary.expense = roundMoney(
      summary.expense +
        item.movements.expense.amount
    );

    summary.transferIn = roundMoney(
      summary.transferIn +
        item.movements.transferIn.amount
    );

    summary.transferOut = roundMoney(
      summary.transferOut +
        item.movements.transferOut.amount
    );

    summary.theoreticalBalance = roundMoney(
      summary.theoreticalBalance +
        item.theoreticalBalance
    );

    summary.storedBalance = roundMoney(
      summary.storedBalance +
        item.storedBalance
    );

    summary.difference = roundMoney(
      summary.storedBalance -
        summary.theoreticalBalance
    );
  }

  return {
    generatedAt: new Date(),

    totalAccounts: results.length,

    balancedAccounts:
      results.length - discrepancies.length,

    discrepancyAccounts:
      discrepancies.length,

    isBalanced:
      discrepancies.length === 0,

    currencies,

    accounts: results,
  };
};

// ======================================================
// RÉPARATION CONTRÔLÉE DU SOLDE
// ======================================================

const repairAccountBalance = async ({
  churchId,
  accountId,
}) => {
  const reconciliation = await reconcileAccount({
    churchId,
    accountId,
  });

  if (!reconciliation) {
    return null;
  }

  if (reconciliation.isBalanced) {
    return {
      repaired: false,
      reason: "already_balanced",
      reconciliation,
    };
  }

  const churchObjectId = toObjectId(churchId);
  const accountObjectId = toObjectId(accountId);

  const previousBalance =
    reconciliation.storedBalance;

  const newBalance =
    reconciliation.theoreticalBalance;

  const account =
    await FinanceAccount.findOneAndUpdate(
      {
        _id: accountObjectId,
        church: churchObjectId,
      },
      {
        $set: {
          currentBalance: newBalance,
        },
      },
      {
        new: true,
      }
    );

  if (!account) {
    return null;
  }

  const finalReconciliation =
    await reconcileAccount({
      churchId,
      accountId,
    });

  return {
    repaired: true,

    previousBalance,

    newBalance,

    correctedDifference: roundMoney(
      newBalance - previousBalance
    ),

    reconciliation:
      finalReconciliation,
  };
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  calculateAccountMovements,
  reconcileAccount,
  reconcileChurchAccounts,
  repairAccountBalance,
};