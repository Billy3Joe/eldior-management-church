const mongoose = require("mongoose");

const FinanceAccount = require("../models/FinanceAccount");
const FinanceTransaction = require("../models/FinanceTransaction");
const FinanceBudget = require("../models/FinanceBudget");

const {
  reconcileChurchAccounts,
} = require("../services/financeReconciliationService");

// ======================================================
// HELPERS
// ======================================================

const getChurchId = (req) => {
  return (
    req.churchId ||
    req.user?.church?._id ||
    req.user?.church ||
    null
  );
};

const roundMoney = (value) => {
  return (
    Math.round(
      (Number(value || 0) + Number.EPSILON) * 100
    ) / 100
  );
};

const getMonthRange = (year, month) => {
  const startDate = new Date(
    Date.UTC(year, month - 1, 1, 0, 0, 0, 0)
  );

  const endDate = new Date(
    Date.UTC(year, month, 0, 23, 59, 59, 999)
  );

  return {
    startDate,
    endDate,
  };
};

const normalizePeriod = (req) => {
  const now = new Date();

  const year =
    Number.parseInt(req.query.year, 10) ||
    now.getUTCFullYear();

  const month =
    Number.parseInt(req.query.month, 10) ||
    now.getUTCMonth() + 1;

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200
  ) {
    return {
      success: false,
      message: "Année financière invalide.",
    };
  }

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return {
      success: false,
      message: "Mois financier invalide.",
    };
  }

  return {
    success: true,
    year,
    month,
    ...getMonthRange(year, month),
  };
};

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeCurrency = (value) =>
  String(value || "EUR")
    .trim()
    .toUpperCase();

// ======================================================
// GET DASHBOARD
// GET /api/finance/dashboard
// ======================================================

const getFinanceDashboard = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (
      !churchId ||
      !mongoose.Types.ObjectId.isValid(churchId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Église active invalide ou introuvable.",
      });
    }

    const period = normalizePeriod(req);

    if (!period.success) {
      return res.status(400).json({
        success: false,
        message: period.message,
      });
    }

    const {
      year,
      month,
      startDate,
      endDate,
    } = period;

    const churchObjectId =
      new mongoose.Types.ObjectId(
        String(churchId)
      );

    // ==================================================
    // CHARGEMENTS PRINCIPAUX
    // ==================================================

    const [
      accounts,
      monthlyTransactions,
      recentTransactions,
      budgets,
      reconciliation,
    ] = await Promise.all([
      FinanceAccount.find({
        church: churchObjectId,
      })
        .sort({
          isDefault: -1,
          sortOrder: 1,
          name: 1,
        })
        .lean(),

      FinanceTransaction.find({
        church: churchObjectId,
        status: "confirmed",
        transactionDate: {
          $gte: startDate,
          $lte: endDate,
        },
      })
        .populate(
          "category",
          "name type code color icon"
        )
        .populate(
          "account",
          "name type currency"
        )
        .populate(
          "fromAccount",
          "name type currency"
        )
        .populate(
          "toAccount",
          "name type currency"
        )
        .populate(
          "member",
          "firstName lastName name"
        )
        .sort({
          transactionDate: -1,
          createdAt: -1,
        })
        .lean(),

      FinanceTransaction.find({
        church: churchObjectId,
        status: "confirmed",
      })
        .populate(
          "category",
          "name type code color icon"
        )
        .populate(
          "account",
          "name type currency"
        )
        .populate(
          "fromAccount",
          "name type currency"
        )
        .populate(
          "toAccount",
          "name type currency"
        )
        .sort({
          transactionDate: -1,
          createdAt: -1,
        })
        .limit(10)
        .lean(),

      FinanceBudget.find({
        church: churchObjectId,
        status: {
          $in: ["active", "draft"],
        },
        startDate: {
          $lte: endDate,
        },
        endDate: {
          $gte: startDate,
        },
      })
        .populate(
          "category",
          "name type code"
        )
        .populate(
          "department",
          "name"
        )
        .sort({
          startDate: -1,
          createdAt: -1,
        })
        .lean(),

      reconcileChurchAccounts({
        churchId: churchObjectId,
      }),
    ]);

    // ==================================================
    // COMPTES PAR DEVISE
    // ==================================================

    const accountSummaryByCurrency = {};

    for (const account of accounts) {
      const currency =
        normalizeCurrency(
          account.currency
        );

      if (
        !accountSummaryByCurrency[currency]
      ) {
        accountSummaryByCurrency[currency] = {
          currency,
          totalBalance: 0,
          openingBalance: 0,
          totalAccounts: 0,
          activeAccounts: 0,
        };
      }

      const summary =
        accountSummaryByCurrency[
          currency
        ];

      summary.totalBalance = roundMoney(
        summary.totalBalance +
          Number(
            account.currentBalance || 0
          )
      );

      summary.openingBalance = roundMoney(
        summary.openingBalance +
          Number(
            account.openingBalance || 0
          )
      );

      summary.totalAccounts += 1;

      if (account.isActive !== false) {
        summary.activeAccounts += 1;
      }
    }

    // ==================================================
    // MOUVEMENTS DU MOIS PAR DEVISE
    // ==================================================

    const movementsByCurrency = {};

    const getCurrencyMovement = (
      currency
    ) => {
      const normalized =
        normalizeCurrency(currency);

      if (
        !movementsByCurrency[normalized]
      ) {
        movementsByCurrency[normalized] = {
          currency: normalized,

          income: 0,
          expense: 0,
          transfer: 0,

          incomeCount: 0,
          expenseCount: 0,
          transferCount: 0,

          net: 0,

          tithe: 0,
          offering: 0,
          donation: 0,

          titheCount: 0,
          offeringCount: 0,
          donationCount: 0,

          // Nombre de donateurs uniques
          // pour CETTE devise uniquement.
          donorCount: 0,
        };
      }

      return movementsByCurrency[
        normalized
      ];
    };

    for (
      const transaction of
      monthlyTransactions
    ) {
      const currencyData =
        getCurrencyMovement(
          transaction.currency
        );

      const amount = Number(
        transaction.amount || 0
      );

      if (
        transaction.type === "income"
      ) {
        currencyData.income =
          roundMoney(
            currencyData.income +
              amount
          );

        currencyData.incomeCount += 1;

        const categoryText =
          normalizeText(
            `${
              transaction.category
                ?.name || ""
            } ${
              transaction.category
                ?.code || ""
            }`
          );

        if (
          categoryText.includes(
            "dime"
          ) ||
          categoryText.includes(
            "tithe"
          )
        ) {
          currencyData.tithe =
            roundMoney(
              currencyData.tithe +
                amount
            );

          currencyData.titheCount += 1;
        }

        if (
          categoryText.includes(
            "offrande"
          ) ||
          categoryText.includes(
            "offering"
          )
        ) {
          currencyData.offering =
            roundMoney(
              currencyData.offering +
                amount
            );

          currencyData.offeringCount +=
            1;
        }

        if (
          categoryText.includes("don") ||
          categoryText.includes(
            "donation"
          )
        ) {
          currencyData.donation =
            roundMoney(
              currencyData.donation +
                amount
            );

          currencyData.donationCount +=
            1;
        }
      }

      if (
        transaction.type === "expense"
      ) {
        currencyData.expense =
          roundMoney(
            currencyData.expense +
              amount
          );

        currencyData.expenseCount += 1;
      }

      if (
        transaction.type === "transfer"
      ) {
        currencyData.transfer =
          roundMoney(
            currencyData.transfer +
              amount
          );

        currencyData.transferCount += 1;
      }
    }

    for (
      const currency of Object.keys(
        movementsByCurrency
      )
    ) {
      const item =
        movementsByCurrency[currency];

      item.net = roundMoney(
        item.income - item.expense
      );
    }

    // ==================================================
    // ÉVOLUTION JOURNALIÈRE
    // ==================================================

    const dailyMap = {};

    for (
      const transaction of
      monthlyTransactions
    ) {
      if (
        transaction.type !==
          "income" &&
        transaction.type !==
          "expense"
      ) {
        continue;
      }

      const date = new Date(
        transaction.transactionDate
      );

      const day = String(
        date.getUTCDate()
      ).padStart(2, "0");

      const currency =
        normalizeCurrency(
          transaction.currency
        );

      const key =
        `${currency}-${day}`;

      if (!dailyMap[key]) {
        dailyMap[key] = {
          day,
          currency,
          income: 0,
          expense: 0,
          net: 0,
        };
      }

      const item = dailyMap[key];

      const amount = Number(
        transaction.amount || 0
      );

      if (
        transaction.type === "income"
      ) {
        item.income = roundMoney(
          item.income + amount
        );
      }

      if (
        transaction.type === "expense"
      ) {
        item.expense = roundMoney(
          item.expense + amount
        );
      }

      item.net = roundMoney(
        item.income - item.expense
      );
    }

    const dailyEvolution =
      Object.values(dailyMap).sort(
        (a, b) => {
          if (
            a.currency !== b.currency
          ) {
            return a.currency.localeCompare(
              b.currency
            );
          }

          return (
            Number(a.day) -
            Number(b.day)
          );
        }
      );

    // ==================================================
    // DONATEURS PAR DEVISE
    // ==================================================

    /*
     * Avant :
     * un seul Set global était utilisé.
     *
     * Conséquence :
     * 1 donateur EUR apparaissait aussi
     * lorsque le dashboard affichait XAF.
     *
     * Maintenant :
     * chaque devise possède son propre Set.
     */
    const donorKeysByCurrency = {};

    const getDonorSet = (currency) => {
      const normalized =
        normalizeCurrency(currency);

      if (
        !donorKeysByCurrency[
          normalized
        ]
      ) {
        donorKeysByCurrency[
          normalized
        ] = new Set();
      }

      return donorKeysByCurrency[
        normalized
      ];
    };

    for (
      const transaction of
      monthlyTransactions
    ) {
      if (
        transaction.type !==
          "income" ||
        transaction.isAnonymous === true
      ) {
        continue;
      }

      const donorSet =
        getDonorSet(
          transaction.currency
        );

      if (
        transaction.member?._id
      ) {
        donorSet.add(
          `member:${String(
            transaction.member._id
          )}`
        );

        continue;
      }

      if (
        transaction.donorName?.trim()
      ) {
        donorSet.add(
          `name:${normalizeText(
            transaction.donorName
          )}`
        );
      }
    }

    /*
     * Injecte le compteur dans chaque
     * résumé de devise.
     */
    for (
      const currency of Object.keys(
        donorKeysByCurrency
      )
    ) {
      const currencyData =
        getCurrencyMovement(currency);

      currencyData.donorCount =
        donorKeysByCurrency[
          currency
        ].size;
    }

    /*
     * On conserve aussi le total global
     * pour compatibilité avec d'autres
     * composants éventuels.
     *
     * Un même donateur présent dans
     * plusieurs devises ne doit être
     * compté qu'une seule fois ici.
     */
    const globalDonorKeys =
      new Set();

    for (
      const donorSet of
      Object.values(
        donorKeysByCurrency
      )
    ) {
      for (
        const donorKey of donorSet
      ) {
        globalDonorKeys.add(
          donorKey
        );
      }
    }

    // ==================================================
    // BUDGETS
    // ==================================================

    const budgetSummaryByCurrency = {};

    for (const budget of budgets) {
      const currency =
        normalizeCurrency(
          budget.currency
        );

      if (
        !budgetSummaryByCurrency[
          currency
        ]
      ) {
        budgetSummaryByCurrency[
          currency
        ] = {
          currency,

          budgetedExpense: 0,
          actualExpense: 0,

          budgetedIncome: 0,
          actualIncome: 0,

          activeBudgets: 0,
          draftBudgets: 0,

          alertBudgets: 0,
          exceededBudgets: 0,
        };
      }

      const summary =
        budgetSummaryByCurrency[
          currency
        ];

      if (
        budget.status === "active"
      ) {
        summary.activeBudgets += 1;
      }

      if (
        budget.status === "draft"
      ) {
        summary.draftBudgets += 1;
      }

      /*
       * Les budgets départementaux
       * ne sont pas encore rattachables
       * automatiquement aux transactions.
       */
      if (
        budget.scopeType ===
        "department"
      ) {
        if (
          budget.budgetType ===
          "expense"
        ) {
          summary.budgetedExpense =
            roundMoney(
              summary.budgetedExpense +
                Number(
                  budget.amount || 0
                )
            );
        }

        if (
          budget.budgetType ===
          "income"
        ) {
          summary.budgetedIncome =
            roundMoney(
              summary.budgetedIncome +
                Number(
                  budget.amount || 0
                )
            );
        }

        continue;
      }

      const transactionFilter = {
        church: churchObjectId,
        status: "confirmed",
        type: budget.budgetType,
        currency,
        transactionDate: {
          $gte: budget.startDate,
          $lte: budget.endDate,
        },
      };

      if (
        budget.scopeType ===
          "category" &&
        budget.category
      ) {
        transactionFilter.category =
          budget.category._id ||
          budget.category;
      }

      const actualResult =
        await FinanceTransaction.aggregate([
          {
            $match: {
              ...transactionFilter,

              ...(transactionFilter.category
                ? {
                    category:
                      new mongoose.Types.ObjectId(
                        String(
                          transactionFilter.category
                        )
                      ),
                  }
                : {}),
            },
          },

          {
            $group: {
              _id: null,

              amount: {
                $sum: "$amount",
              },
            },
          },
        ]);

      const actual = roundMoney(
        actualResult[0]?.amount || 0
      );

      const budgetAmount = Number(
        budget.amount || 0
      );

      if (
        budget.budgetType ===
        "expense"
      ) {
        summary.budgetedExpense =
          roundMoney(
            summary.budgetedExpense +
              budgetAmount
          );

        summary.actualExpense =
          roundMoney(
            summary.actualExpense +
              actual
          );
      }

      if (
        budget.budgetType ===
        "income"
      ) {
        summary.budgetedIncome =
          roundMoney(
            summary.budgetedIncome +
              budgetAmount
          );

        summary.actualIncome =
          roundMoney(
            summary.actualIncome +
              actual
          );
      }

      const threshold = Number(
        budget.warningThresholdPercent ||
          0
      );

      const warningAmount =
        (budgetAmount * threshold) /
        100;

      if (
        budget.enableAlerts === true &&
        budgetAmount > 0 &&
        actual >= warningAmount
      ) {
        summary.alertBudgets += 1;
      }

      if (
        actual > budgetAmount
      ) {
        summary.exceededBudgets += 1;
      }
    }

    // ==================================================
    // RÉCONCILIATION
    // ==================================================

    const reconciliationSummary = {
      isBalanced:
        reconciliation?.isBalanced ===
        true,

      totalAccounts:
        reconciliation?.totalAccounts ||
        0,

      balancedAccounts:
        reconciliation?.balancedAccounts ||
        0,

      discrepancyAccounts:
        reconciliation?.discrepancyAccounts ||
        0,

      currencies:
        reconciliation?.currencies ||
        {},
    };

    // ==================================================
    // RÉPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      data: {
        generatedAt: new Date(),

        period: {
          year,
          month,
          startDate,
          endDate,
        },

        accounts: {
          total: accounts.length,

          active: accounts.filter(
            (account) =>
              account.isActive !==
              false
          ).length,

          inactive: accounts.filter(
            (account) =>
              account.isActive ===
              false
          ).length,

          byCurrency:
            accountSummaryByCurrency,

          list: accounts.map(
            (account) => ({
              _id: account._id,

              name: account.name,

              type: account.type,

              currency:
                account.currency,

              openingBalance:
                Number(
                  account.openingBalance ||
                    0
                ),

              currentBalance:
                Number(
                  account.currentBalance ||
                    0
                ),

              isActive:
                account.isActive,

              isDefault:
                account.isDefault,
            })
          ),
        },

        movements: {
          transactionCount:
            monthlyTransactions.length,

          /*
           * Total global conservé
           * pour compatibilité.
           */
          donorCount:
            globalDonorKeys.size,

          /*
           * IMPORTANT :
           * chaque devise possède maintenant
           * son propre donorCount.
           */
          byCurrency:
            movementsByCurrency,

          dailyEvolution,
        },

        budgets: {
          total: budgets.length,

          active: budgets.filter(
            (budget) =>
              budget.status ===
              "active"
          ).length,

          draft: budgets.filter(
            (budget) =>
              budget.status ===
              "draft"
          ).length,

          byCurrency:
            budgetSummaryByCurrency,
        },

        reconciliation:
          reconciliationSummary,

        recentTransactions:
          recentTransactions.map(
            (transaction) => ({
              _id:
                transaction._id,

              type:
                transaction.type,

              amount:
                transaction.amount,

              currency:
                transaction.currency,

              title:
                transaction.title,

              transactionDate:
                transaction.transactionDate,

              donorName:
                transaction.donorName ||
                "",

              isAnonymous:
                transaction.isAnonymous ===
                true,

              category:
                transaction.category ||
                null,

              account:
                transaction.account ||
                null,

              fromAccount:
                transaction.fromAccount ||
                null,

              toAccount:
                transaction.toAccount ||
                null,

              paymentMethod:
                transaction.paymentMethod,

              reference:
                transaction.reference ||
                "",

              receiptNumber:
                transaction.receiptNumber ||
                "",
            })
          ),
      },
    });
  } catch (error) {
    console.error(
      "Erreur getFinanceDashboard :",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Impossible de charger le tableau de bord financier.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};

module.exports = {
  getFinanceDashboard,
};