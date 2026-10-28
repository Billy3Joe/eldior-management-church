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

const getChurchId = (req) =>
  req.churchId ||
  req.user?.church?._id ||
  req.user?.church ||
  null;

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeCurrency = (value) =>
  String(value || "EUR").trim().toUpperCase();

const getMonthRange = (year, month) => ({
  startDate: new Date(
    Date.UTC(year, month - 1, 1, 0, 0, 0, 0)
  ),
  endDate: new Date(
    Date.UTC(year, month, 0, 23, 59, 59, 999)
  ),
});

const normalizePeriod = (req) => {
  const now = new Date();

  const parseInteger = (value, fallback) => {
    if (value === undefined) return fallback;

    const text = String(value).trim();

    if (!/^\d+$/.test(text)) return NaN;

    return Number(text);
  };

  const year = parseInteger(
    req.query.year,
    now.getUTCFullYear()
  );

  const month = parseInteger(
    req.query.month,
    now.getUTCMonth() + 1
  );

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

// ======================================================
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
        message: "Église active invalide ou introuvable.",
      });
    }

    const period = normalizePeriod(req);

    if (!period.success) {
      return res.status(400).json({
        success: false,
        message: period.message,
      });
    }

    const { year, month, startDate, endDate } = period;

    const churchObjectId = new mongoose.Types.ObjectId(
      String(churchId)
    );

    // ==================================================
    // CHARGEMENT DES DONNÉES
    // ==================================================

    const [
      accounts,
      monthlyTransactions,
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

      FinanceBudget.find({
        church: churchObjectId,
        status: { $in: ["active", "draft"] },
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
      })
        .populate("category", "name type code")
        .populate("department", "name")
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
    // 10 DERNIÈRES TRANSACTIONS PAR DEVISE
    // ==================================================

    const transactionCurrencies =
      await FinanceTransaction.distinct(
        "currency",
        {
          church: churchObjectId,
          status: "confirmed",
        }
      );

    const recentTransactions = (
      await Promise.all(
        transactionCurrencies.map((currency) =>
          FinanceTransaction.find({
            church: churchObjectId,
            status: "confirmed",
            currency,
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
            .lean()
        )
      )
    ).flat();

    // ==================================================
    // COMPTES PAR DEVISE
    // ==================================================

    const accountSummaryByCurrency = {};

    for (const account of accounts) {
      const currency = normalizeCurrency(
        account.currency
      );

      if (!accountSummaryByCurrency[currency]) {
        accountSummaryByCurrency[currency] = {
          currency,
          totalBalance: 0,
          openingBalance: 0,
          totalAccounts: 0,
          activeAccounts: 0,
        };
      }

      const summary = accountSummaryByCurrency[currency];

      summary.totalBalance = roundMoney(
        summary.totalBalance +
          Number(account.currentBalance || 0)
      );

      summary.openingBalance = roundMoney(
        summary.openingBalance +
          Number(account.openingBalance || 0)
      );

      summary.totalAccounts += 1;

      if (account.isActive !== false) {
        summary.activeAccounts += 1;
      }
    }

    // ==================================================
    // MOUVEMENTS FINANCIERS PAR DEVISE
    // ==================================================

    const movementsByCurrency = {};

    const getCurrencyMovement = (currency) => {
      const normalized = normalizeCurrency(currency);

      if (!movementsByCurrency[normalized]) {
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

          donorCount: 0,
        };
      }

      return movementsByCurrency[normalized];
    };

    for (const transaction of monthlyTransactions) {
      const stats = getCurrencyMovement(
        transaction.currency
      );

      const amount = Number(transaction.amount || 0);

      if (transaction.type === "income") {
        stats.income = roundMoney(
          stats.income + amount
        );

        stats.incomeCount += 1;

        const categoryText = normalizeText(
          `${transaction.category?.name || ""} ${
            transaction.category?.code || ""
          }`
        );

        if (
          categoryText.includes("dime") ||
          categoryText.includes("tithe")
        ) {
          stats.tithe = roundMoney(
            stats.tithe + amount
          );

          stats.titheCount += 1;
        }

        if (
          categoryText.includes("offrande") ||
          categoryText.includes("offering")
        ) {
          stats.offering = roundMoney(
            stats.offering + amount
          );

          stats.offeringCount += 1;
        }

        if (
          categoryText.includes("don") ||
          categoryText.includes("donation")
        ) {
          stats.donation = roundMoney(
            stats.donation + amount
          );

          stats.donationCount += 1;
        }
      }

      if (transaction.type === "expense") {
        stats.expense = roundMoney(
          stats.expense + amount
        );

        stats.expenseCount += 1;
      }

      if (transaction.type === "transfer") {
        stats.transfer = roundMoney(
          stats.transfer + amount
        );

        stats.transferCount += 1;
      }
    }

    for (const stats of Object.values(
      movementsByCurrency
    )) {
      stats.net = roundMoney(
        stats.income - stats.expense
      );
    }

    // ==================================================
    // ÉVOLUTION FINANCIÈRE JOURNALIÈRE
    // ==================================================

    const dailyMap = {};

    for (const transaction of monthlyTransactions) {
      if (
        transaction.type !== "income" &&
        transaction.type !== "expense"
      ) {
        continue;
      }

      const date = new Date(
        transaction.transactionDate
      );

      const day = String(
        date.getUTCDate()
      ).padStart(2, "0");

      const currency = normalizeCurrency(
        transaction.currency
      );

      const key = `${currency}-${day}`;

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

      if (transaction.type === "income") {
        item.income = roundMoney(
          item.income + amount
        );
      }

      if (transaction.type === "expense") {
        item.expense = roundMoney(
          item.expense + amount
        );
      }

      item.net = roundMoney(
        item.income - item.expense
      );
    }

    const dailyEvolution = Object.values(
      dailyMap
    ).sort((a, b) => {
      if (a.currency !== b.currency) {
        return a.currency.localeCompare(
          b.currency
        );
      }

      return Number(a.day) - Number(b.day);
    });

    // ==================================================
    // DONATEURS UNIQUES PAR DEVISE
    // ==================================================

    const donorKeysByCurrency = {};

    const getDonorSet = (currency) => {
      const normalized = normalizeCurrency(
        currency
      );

      if (!donorKeysByCurrency[normalized]) {
        donorKeysByCurrency[normalized] =
          new Set();
      }

      return donorKeysByCurrency[normalized];
    };

    for (const transaction of monthlyTransactions) {
      if (
        transaction.type !== "income" ||
        transaction.isAnonymous === true
      ) {
        continue;
      }

      const donorSet = getDonorSet(
        transaction.currency
      );

      if (transaction.member?._id) {
        donorSet.add(
          `member:${String(
            transaction.member._id
          )}`
        );

        continue;
      }

      if (transaction.donorName?.trim()) {
        donorSet.add(
          `name:${normalizeText(
            transaction.donorName
          )}`
        );
      }
    }

    for (const [
      currency,
      donorSet,
    ] of Object.entries(donorKeysByCurrency)) {
      getCurrencyMovement(currency).donorCount =
        donorSet.size;
    }

    const globalDonorKeys = new Set();

    for (const donorSet of Object.values(
      donorKeysByCurrency
    )) {
      for (const donorKey of donorSet) {
        globalDonorKeys.add(donorKey);
      }
    }

    // ==================================================
    // BUDGETS PAR DEVISE
    // ==================================================

    const budgetSummaryByCurrency = {};

    for (const budget of budgets) {
      const currency = normalizeCurrency(
        budget.currency
      );

      if (!budgetSummaryByCurrency[currency]) {
        budgetSummaryByCurrency[currency] = {
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
        budgetSummaryByCurrency[currency];

      if (budget.status === "active") {
        summary.activeBudgets += 1;
      }

      if (budget.status === "draft") {
        summary.draftBudgets += 1;
      }

      const budgetAmount = Number(
        budget.amount || 0
      );

      // Les budgets départementaux ne sont
      // pas encore reliés aux transactions.
      if (budget.scopeType === "department") {
        if (budget.budgetType === "expense") {
          summary.budgetedExpense = roundMoney(
            summary.budgetedExpense +
              budgetAmount
          );
        }

        if (budget.budgetType === "income") {
          summary.budgetedIncome = roundMoney(
            summary.budgetedIncome +
              budgetAmount
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
        budget.scopeType === "category" &&
        budget.category
      ) {
        transactionFilter.category =
          new mongoose.Types.ObjectId(
            String(
              budget.category._id ||
              budget.category
            )
          );
      }

      const actualResult =
        await FinanceTransaction.aggregate([
          {
            $match: transactionFilter,
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

      if (budget.budgetType === "expense") {
        summary.budgetedExpense = roundMoney(
          summary.budgetedExpense +
            budgetAmount
        );

        summary.actualExpense = roundMoney(
          summary.actualExpense + actual
        );
      }

      if (budget.budgetType === "income") {
        summary.budgetedIncome = roundMoney(
          summary.budgetedIncome +
            budgetAmount
        );

        summary.actualIncome = roundMoney(
          summary.actualIncome + actual
        );
      }

      const threshold = Number(
        budget.warningThresholdPercent || 0
      );

      const warningAmount =
        (budgetAmount * threshold) / 100;

      if (
        budget.enableAlerts === true &&
        budgetAmount > 0 &&
        actual >= warningAmount
      ) {
        summary.alertBudgets += 1;
      }

      if (actual > budgetAmount) {
        summary.exceededBudgets += 1;
      }
    }

    // ==================================================
    // RAPPROCHEMENT FINANCIER
    // ==================================================

    const reconciliationSummary = {
      isBalanced:
        reconciliation?.isBalanced === true,

      totalAccounts:
        reconciliation?.totalAccounts || 0,

      balancedAccounts:
        reconciliation?.balancedAccounts || 0,

      discrepancyAccounts:
        reconciliation?.discrepancyAccounts || 0,

      currencies:
        reconciliation?.currencies || {},
    };

    // ==================================================
    // RÉPONSE API
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
              account.isActive !== false
          ).length,

          inactive: accounts.filter(
            (account) =>
              account.isActive === false
          ).length,

          byCurrency:
            accountSummaryByCurrency,

          list: accounts.map((account) => ({
            _id: account._id,
            name: account.name,
            type: account.type,
            currency: account.currency,

            openingBalance: Number(
              account.openingBalance || 0
            ),

            currentBalance: Number(
              account.currentBalance || 0
            ),

            isActive: account.isActive,
            isDefault: account.isDefault,
          })),
        },

        movements: {
          transactionCount:
            monthlyTransactions.length,

          donorCount:
            globalDonorKeys.size,

          byCurrency:
            movementsByCurrency,

          dailyEvolution,
        },

        budgets: {
          total: budgets.length,

          active: budgets.filter(
            (budget) =>
              budget.status === "active"
          ).length,

          draft: budgets.filter(
            (budget) =>
              budget.status === "draft"
          ).length,

          byCurrency:
            budgetSummaryByCurrency,
        },

        reconciliation:
          reconciliationSummary,

        recentTransactions:
          recentTransactions.map(
            (transaction) => ({
              _id: transaction._id,

              type: transaction.type,
              amount: transaction.amount,
              currency: transaction.currency,
              title: transaction.title,

              transactionDate:
                transaction.transactionDate,

              donorName:
                transaction.donorName || "",

              isAnonymous:
                transaction.isAnonymous === true,

              category:
                transaction.category || null,

              account:
                transaction.account || null,

              fromAccount:
                transaction.fromAccount || null,

              toAccount:
                transaction.toAccount || null,

              paymentMethod:
                transaction.paymentMethod,

              reference:
                transaction.reference || "",

              receiptNumber:
                transaction.receiptNumber || "",
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
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  getFinanceDashboard,
};import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

import API from "../../api/axios";
import Layout from "../../components/Layout";
import {
  formatCurrency,
} from "../../constants/currencies";

import "../../styles/ManagementPages.css";

// ======================================================
// CONSTANTES
// ======================================================

const MONTHS = [
  { value: 1, label: "Janvier" },
  { value: 2, label: "Février" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Avril" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juin" },
  { value: 7, label: "Juillet" },
  { value: 8, label: "Août" },
  { value: 9, label: "Septembre" },
  { value: 10, label: "Octobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Décembre" },
];

const ACCOUNT_TYPES = {
  cash: "Caisse",
  bank: "Compte bancaire",
  mobile_money: "Mobile Money",
  card: "Carte",
  online: "Compte en ligne",
  other: "Autre",
};

const TRANSACTION_TYPES = {
  income: "Entrée",
  expense: "Sortie",
  transfer: "Transfert",
};

// ======================================================
// HELPERS
// ======================================================

const getCurrentPeriod = () => {
  const now = new Date();

  return {
    month: now.getUTCMonth() + 1,
    year: now.getUTCFullYear(),
  };
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.message || fallback;

const toNumber = (value) =>
  Number(value || 0);

// ======================================================
// COMPOSANT
// ======================================================

export default function FinanceDashboard() {
  const navigate = useNavigate();

  const initialPeriod = useMemo(
    () => getCurrentPeriod(),
    []
  );

  const [month, setMonth] = useState(
    initialPeriod.month
  );

  const [year, setYear] = useState(
    initialPeriod.year
  );

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const [
    defaultCurrency,
    setDefaultCurrency,
  ] = useState("");

  const [
    selectedCurrency,
    setSelectedCurrency,
  ] = useState("");

  // ====================================================
  // NAVIGATION
  // ====================================================

  const buildTransactionUrl = (
    extraParams = {}
  ) => {
    const params = new URLSearchParams({
      month: `${year}-${String(month).padStart(
        2,
        "0"
      )}`,
      currency: selectedCurrency,
      status: "confirmed",
      ...extraParams,
    });

    return `/finance/transactions?${params.toString()}`;
  };

  const clickableCardStyle = {
    cursor: "pointer",
    transition:
      "transform 0.15s ease, box-shadow 0.15s ease",
  };

  const handleCardKeyDown = (
    event,
    target
  ) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      navigate(target);
    }
  };

  // ====================================================
  // CHARGEMENT DES DONNÉES
  // ====================================================

  const fetchDashboard = useCallback(
    async () => {
      try {
        setLoading(true);

        const [
          dashboardResponse,
          settingsResponse,
        ] = await Promise.all([
          API.get("/finance/dashboard", {
            params: {
              month,
              year,
            },
          }),
          API.get("/settings"),
        ]);

        const dashboardData =
          dashboardResponse?.data?.data ||
          null;

        const churchCurrency = String(
          settingsResponse?.data?.data
            ?.defaultCurrency ||
          settingsResponse?.data?.church
            ?.defaultCurrency ||
          settingsResponse?.data
            ?.defaultCurrency ||
          "EUR"
        )
          .trim()
          .toUpperCase();

        setDefaultCurrency(
          churchCurrency
        );

        setData(
          dashboardData
        );

        setSelectedCurrency(
          (currentCurrency) =>
            currentCurrency ||
            churchCurrency
        );
      } catch (error) {
        console.error(
          "Erreur dashboard financier :",
          error
        );

        toast.error(
          getErrorMessage(
            error,
            "Impossible de charger le tableau de bord financier."
          )
        );

        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [month, year]
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ====================================================
  // DEVISES DISPONIBLES
  // ====================================================

  const currencies = useMemo(() => {
    const values = new Set();

    if (defaultCurrency) {
      values.add(defaultCurrency);
    }

    const sources = [
      data?.accounts?.byCurrency,
      data?.movements?.byCurrency,
      data?.budgets?.byCurrency,
      data?.reconciliation?.currencies,
    ];

    sources.forEach((source) => {
      Object.keys(source || {}).forEach(
        (currency) => {
          if (currency) {
            values.add(
              String(currency)
                .trim()
                .toUpperCase()
            );
          }
        }
      );
    });

    return Array.from(values).sort();
  }, [data, defaultCurrency]);

  useEffect(() => {
    if (!defaultCurrency) return;

    if (!selectedCurrency) {
      setSelectedCurrency(
        defaultCurrency
      );

      return;
    }

    if (
      currencies.length > 0 &&
      !currencies.includes(
        selectedCurrency
      )
    ) {
      setSelectedCurrency(
        currencies.includes(defaultCurrency)
          ? defaultCurrency
          : currencies[0]
      );
    }
  }, [
    currencies,
    selectedCurrency,
    defaultCurrency,
  ]);

  // ====================================================
  // STATISTIQUES DE LA DEVISE
  // ====================================================

  const accountStats =
    data?.accounts?.byCurrency?.[
      selectedCurrency
    ] || {
      totalBalance: 0,
      openingBalance: 0,
      totalAccounts: 0,
      activeAccounts: 0,
    };

  const movementStats =
    data?.movements?.byCurrency?.[
      selectedCurrency
    ] || {
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

      donorCount: 0,
    };

  const budgetStats =
    data?.budgets?.byCurrency?.[
      selectedCurrency
    ] || {
      budgetedExpense: 0,
      actualExpense: 0,

      budgetedIncome: 0,
      actualIncome: 0,

      activeBudgets: 0,
      draftBudgets: 0,

      alertBudgets: 0,
      exceededBudgets: 0,
    };

  const reconciliationStats =
    data?.reconciliation?.currencies?.[
      selectedCurrency
    ] || {
      openingBalance: 0,
      income: 0,
      expense: 0,
      transferIn: 0,
      transferOut: 0,
      theoreticalBalance: 0,
      storedBalance: 0,
      difference: 0,
    };

  // ====================================================
  // GRAPHIQUE
  // ====================================================

  const chartData = useMemo(() => {
    return (
      data?.movements?.dailyEvolution ||
      []
    )
      .filter(
        (item) =>
          String(
            item.currency || ""
          ).toUpperCase() ===
          selectedCurrency
      )
      .map((item) => ({
        jour: item.day,
        Entrées: toNumber(
          item.income
        ),
        Sorties: toNumber(
          item.expense
        ),
      }));
  }, [data, selectedCurrency]);

  // ====================================================
  // COMPTES FINANCIERS
  // ====================================================

  const currencyAccounts = useMemo(
    () =>
      (
        data?.accounts?.list || []
      ).filter(
        (account) =>
          String(
            account.currency || ""
          ).toUpperCase() ===
          selectedCurrency
      ),
    [data, selectedCurrency]
  );

  // ====================================================
  // TRANSACTIONS RÉCENTES
  // ====================================================

  const recentTransactions = useMemo(
    () =>
      (
        data?.recentTransactions || []
      )
        .filter(
          (transaction) =>
            String(
              transaction.currency ||
              ""
            ).toUpperCase() ===
            selectedCurrency
        )
        .sort(
          (a, b) =>
            new Date(
              b.transactionDate
            ).getTime() -
            new Date(
              a.transactionDate
            ).getTime()
        )
        .slice(0, 10),
    [data, selectedCurrency]
  );

  // ====================================================
  // PÉRIODE
  // ====================================================

  const selectedMonthLabel =
    MONTHS.find(
      (item) =>
        item.value === Number(month)
    )?.label || "";

  // ====================================================
  // RENDU DES CARTES
  // ====================================================

  const renderStatCard = ({
    label,
    value,
    description,
    target,
  }) => (
    <div
      className="management-stat-card"
      role="button"
      tabIndex={0}
      style={clickableCardStyle}
      onClick={() => navigate(target)}
      onKeyDown={(event) =>
        handleCardKeyDown(
          event,
          target
        )
      }
    >
      <div className="management-stat-label">
        {label}
      </div>

      <div className="management-stat-value">
        {value}
      </div>

      <div className="management-stat-description">
        {description}
      </div>
    </div>
  );

  // ====================================================
  // CHARGEMENT
  // ====================================================

  if (loading && !data) {
    return (
      <Layout>
        <div className="management-page">
          <div className="management-card">
            <div className="management-empty">
              <div className="management-empty-icon">
                ⏳
              </div>

              <p>
                Chargement du tableau de bord
                financier...
              </p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ====================================================
  // AFFICHAGE PRINCIPAL
  // ====================================================

  return (
    <Layout>
      <div className="management-page">

        {/* EN-TÊTE */}

        <div className="page-header">
          <div>
            <h1 className="page-title">
              Tableau de bord financier
            </h1>

            <p className="page-subtitle">
              Vue financière de l'église —
              {" "}
              {selectedMonthLabel}
              {" "}
              {year}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            style={{
              border: "none",
              borderRadius: "10px",
              padding: "10px 14px",
              cursor: loading
                ? "not-allowed"
                : "pointer",
              fontWeight: 700,
            }}
          >
            {loading
              ? "Actualisation..."
              : "↻ Actualiser"}
          </button>
        </div>

        {/* FILTRES */}

        <div
          className="management-card"
          style={{
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "end",
            }}
          >
            <div
              style={{
                minWidth: "180px",
              }}
            >
              <label
                htmlFor="finance-month"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 700,
                }}
              >
                Mois
              </label>

              <select
                id="finance-month"
                value={month}
                onChange={(event) =>
                  setMonth(
                    Number(
                      event.target.value
                    )
                  )
                }
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                }}
              >
                {MONTHS.map(
                  (item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div
              style={{
                minWidth: "130px",
              }}
            >
              <label
                htmlFor="finance-year"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 700,
                }}
              >
                Année
              </label>

              <input
                id="finance-year"
                type="number"
                min="2000"
                max="2200"
                value={year}
                onChange={(event) =>
                  setYear(
                    Number(
                      event.target.value
                    )
                  )
                }
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                minWidth: "150px",
              }}
            >
              <label
                htmlFor="finance-currency"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 700,
                }}
              >
                Devise
              </label>

              <select
                id="finance-currency"
                value={selectedCurrency}
                onChange={(event) =>
                  setSelectedCurrency(
                    event.target.value
                  )
                }
                disabled={
                  currencies.length === 0
                }
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                }}
              >
                {currencies.length === 0 ? (
                  <option value="">
                    Aucune devise
                  </option>
                ) : (
                  currencies.map(
                    (currency) => (
                      <option
                        key={currency}
                        value={currency}
                      >
                        {currency}
                      </option>
                    )
                  )
                )}
              </select>
            </div>
          </div>
        </div>

        {!selectedCurrency ? (
          <div className="management-card">
            <div className="management-empty">
              <div className="management-empty-icon">
                💰
              </div>

              <h3>
                Aucune donnée financière
              </h3>

              <p>
                Crée d'abord un compte
                financier pour commencer.
              </p>
            </div>
          </div>
        ) : (
          <>

            {/* STATISTIQUES PRINCIPALES */}

            <div className="management-stats-grid">
              {renderStatCard({
                label: "Solde disponible",
                value: formatCurrency(
                  accountStats.totalBalance,
                  selectedCurrency
                ),
                description:
                  `${accountStats.activeAccounts} compte(s) actif(s)`,
                target:
                  "/finance/accounts",
              })}

              {renderStatCard({
                label: "Entrées du mois",
                value: formatCurrency(
                  movementStats.income,
                  selectedCurrency
                ),
                description:
                  `${movementStats.incomeCount} mouvement(s)`,
                target:
                  buildTransactionUrl({
                    type: "income",
                  }),
              })}

              {renderStatCard({
                label: "Sorties du mois",
                value: formatCurrency(
                  movementStats.expense,
                  selectedCurrency
                ),
                description:
                  `${movementStats.expenseCount} mouvement(s)`,
                target:
                  buildTransactionUrl({
                    type: "expense",
                  }),
              })}

              {renderStatCard({
                label: "Solde net du mois",
                value: formatCurrency(
                  movementStats.net,
                  selectedCurrency
                ),
                description:
                  "Entrées - sorties",
                target:
                  buildTransactionUrl(),
              })}
            </div>

            {/* DÎMES, OFFRANDES ET DONS */}

            <div
              className="management-card"
              style={{
                marginTop: "20px",
              }}
            >
              <div className="management-card-header">
                <div>
                  <h2 className="management-card-title">
                    Entrées de l'église
                  </h2>

                  <p className="page-subtitle">
                    Dîmes, offrandes et dons
                    pour la période
                  </p>
                </div>
              </div>

              <div className="management-stats-grid">
                {renderStatCard({
                  label: "Dîmes",
                  value: formatCurrency(
                    movementStats.tithe,
                    selectedCurrency
                  ),
                  description:
                    `${movementStats.titheCount} mouvement(s)`,
                  target:
                    buildTransactionUrl({
                      type: "income",
                      search: "Dîme",
                    }),
                })}

                {renderStatCard({
                  label: "Offrandes",
                  value: formatCurrency(
                    movementStats.offering,
                    selectedCurrency
                  ),
                  description:
                    `${movementStats.offeringCount} mouvement(s)`,
                  target:
                    buildTransactionUrl({
                      type: "income",
                      search: "Offrande",
                    }),
                })}

                {renderStatCard({
                  label: "Dons",
                  value: formatCurrency(
                    movementStats.donation,
                    selectedCurrency
                  ),
                  description:
                    `${movementStats.donationCount} mouvement(s)`,
                  target:
                    buildTransactionUrl({
                      type: "income",
                      search: "Don",
                    }),
                })}

                {renderStatCard({
                  label:
                    "Donateurs identifiés",
                  value:
                    movementStats.donorCount || 0,
                  description:
                    "Hors dons anonymes",
                  target:
                    buildTransactionUrl({
                      type: "income",
                    }),
                })}
              </div>
            </div>

            {/* GRAPHIQUE */}

            <div
              className="management-card"
              style={{
                marginTop: "20px",
              }}
            >
              <div className="management-card-header">
                <div>
                  <h2 className="management-card-title">
                    Évolution du mois
                  </h2>

                  <p className="page-subtitle">
                    Entrées et sorties —{" "}
                    {selectedCurrency}
                  </p>
                </div>
              </div>

              {chartData.length === 0 ? (
                <div className="management-empty">
                  <div className="management-empty-icon">
                    📊
                  </div>

                  <p>
                    Aucun mouvement sur
                    cette période.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "320px",
                    marginTop: "20px",
                  }}
                >
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={chartData}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                      />

                      <XAxis
                        dataKey="jour"
                      />

                      <YAxis />

                      <Tooltip
                        formatter={(value) =>
                          formatCurrency(
                            value,
                            selectedCurrency
                          )
                        }
                      />

                      <Legend />

                      <Bar
                        dataKey="Entrées"
                        fill="#22c55e"
                      />

                      <Bar
                        dataKey="Sorties"
                        fill="#ef4444"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* BUDGETS */}

            <div
              className="management-card"
              style={{
                marginTop: "20px",
              }}
            >
              <div className="management-card-header">
                <div>
                  <h2 className="management-card-title">
                    Situation budgétaire
                  </h2>

                  <p className="page-subtitle">
                    Suivi des budgets en{" "}
                    {selectedCurrency}
                  </p>
                </div>
              </div>

              <div className="management-stats-grid">
                {renderStatCard({
                  label: "Sorties prévues",
                  value: formatCurrency(
                    budgetStats.budgetedExpense,
                    selectedCurrency
                  ),
                  description:
                    "Budget de sorties",
                  target:
                    "/finance/budgets",
                })}

                {renderStatCard({
                  label: "Sorties réalisées",
                  value: formatCurrency(
                    budgetStats.actualExpense,
                    selectedCurrency
                  ),
                  description:
                    "Sorties enregistrées",
                  target:
                    "/finance/budgets",
                })}

                {renderStatCard({
                  label: "Alertes budget",
                  value:
                    budgetStats.alertBudgets,
                  description:
                    "Seuil atteint",
                  target:
                    "/finance/budgets",
                })}

                {renderStatCard({
                  label: "Budgets dépassés",
                  value:
                    budgetStats.exceededBudgets,
                  description:
                    "Montant prévu dépassé",
                  target:
                    "/finance/budgets",
                })}
              </div>
            </div>

            {/* RAPPROCHEMENT FINANCIER */}

            <div
              className="management-card"
              style={{
                marginTop: "20px",
              }}
            >
              <div className="management-card-header">
                <div>
                  <h2 className="management-card-title">
                    Contrôle des soldes
                  </h2>

                  <p className="page-subtitle">
                    Rapprochement financier
                  </p>
                </div>
              </div>

              <div className="management-stats-grid">
                {renderStatCard({
                  label:
                    "Solde théorique",
                  value: formatCurrency(
                    reconciliationStats.theoreticalBalance,
                    selectedCurrency
                  ),
                  description:
                    "Calculé depuis les mouvements",
                  target:
                    "/finance/reconciliation",
                })}

                {renderStatCard({
                  label:
                    "Solde enregistré",
                  value: formatCurrency(
                    reconciliationStats.storedBalance,
                    selectedCurrency
                  ),
                  description:
                    "Solde actuel des comptes",
                  target:
                    "/finance/reconciliation",
                })}

                {renderStatCard({
                  label: "Écart",
                  value: formatCurrency(
                    reconciliationStats.difference,
                    selectedCurrency
                  ),
                  description:
                    "Enregistré - théorique",
                  target:
                    "/finance/reconciliation",
                })}

                {renderStatCard({
                  label:
                    "État général",
                  value:
                    data?.reconciliation?.isBalanced
                      ? "✓ Équilibré"
                      : "⚠ Écart",
                  description:
                    `${
                      data?.reconciliation
                        ?.discrepancyAccounts || 0
                    } compte(s) avec écart`,
                  target:
                    "/finance/reconciliation",
                })}
              </div>
            </div>

            {/* COMPTES FINANCIERS */}

            <div
              className="management-card"
              style={{
                marginTop: "20px",
              }}
            >
              <div className="management-card-header">
                <div>
                  <h2 className="management-card-title">
                    Comptes financiers
                  </h2>

                  <p className="page-subtitle">
                    Comptes en{" "}
                    {selectedCurrency}
                  </p>
                </div>
              </div>

              {currencyAccounts.length === 0 ? (
                <div className="management-empty">
                  <div className="management-empty-icon">
                    💰
                  </div>

                  <p>
                    Aucun compte dans cette
                    devise.
                  </p>
                </div>
              ) : (
                <div className="management-table-wrapper">
                  <table className="management-table">
                    <thead>
                      <tr>
                        <th>Compte</th>
                        <th>Type</th>
                        <th>Solde initial</th>
                        <th>Solde actuel</th>
                        <th>État</th>
                      </tr>
                    </thead>

                    <tbody>
                      {currencyAccounts.map(
                        (account) => (
                          <tr
                            key={account._id}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              navigate(
                                "/finance/accounts"
                              )
                            }
                            onKeyDown={(event) =>
                              handleCardKeyDown(
                                event,
                                "/finance/accounts"
                              )
                            }
                            style={{
                              cursor: "pointer",
                            }}
                            title="Ouvrir les comptes financiers"
                          >
                            <td>
                              <strong>
                                {account.name}
                              </strong>

                              {account.isDefault && (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    opacity: 0.7,
                                    marginTop: "3px",
                                  }}
                                >
                                  Compte par défaut
                                </div>
                              )}
                            </td>

                            <td>
                              {ACCOUNT_TYPES[
                                account.type
                              ] ||
                                account.type}
                            </td>

                            <td>
                              {formatCurrency(
                                account.openingBalance,
                                selectedCurrency
                              )}
                            </td>

                            <td>
                              <strong>
                                {formatCurrency(
                                  account.currentBalance,
                                  selectedCurrency
                                )}
                              </strong>
                            </td>

                            <td>
                              {account.isActive
                                ? "Actif"
                                : "Inactif"}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* DERNIÈRES TRANSACTIONS */}

            <div
              className="management-card"
              style={{
                marginTop: "20px",
              }}
            >
              <div className="management-card-header">
                <div>
                  <h2 className="management-card-title">
                    Derniers mouvements
                  </h2>

                  <p className="page-subtitle">
                    Transactions confirmées
                    récentes
                  </p>
                </div>
              </div>

              {recentTransactions.length === 0 ? (
                <div className="management-empty">
                  <div className="management-empty-icon">
                    💳
                  </div>

                  <p>
                    Aucun mouvement récent
                    dans cette devise.
                  </p>
                </div>
              ) : (
                <div className="management-table-wrapper">
                  <table className="management-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Libellé</th>
                        <th>Type</th>
                        <th>Catégorie</th>
                        <th>Compte</th>
                        <th>Montant</th>
                      </tr>
                    </thead>

                    <tbody>
                      {recentTransactions.map(
                        (transaction) => (
                          <tr
                            key={transaction._id}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              navigate(
                                buildTransactionUrl({
                                  search:
                                    transaction.title ||
                                    "",
                                })
                              )
                            }
                            onKeyDown={(event) =>
                              handleCardKeyDown(
                                event,
                                buildTransactionUrl({
                                  search:
                                    transaction.title ||
                                    "",
                                })
                              )
                            }
                            style={{
                              cursor: "pointer",
                            }}
                            title="Voir dans l'historique des transactions"
                          >
                            <td>
                              {formatDate(
                                transaction.transactionDate
                              )}
                            </td>

                            <td>
                              <strong>
                                {transaction.title}
                              </strong>
                            </td>

                            <td>
                              {TRANSACTION_TYPES[
                                transaction.type
                              ] ||
                                transaction.type}
                            </td>

                            <td>
                              {transaction.category
                                ?.name || "—"}
                            </td>

                            <td>
                              {transaction.type ===
                              "transfer"
                                ? `${
                                    transaction
                                      .fromAccount
                                      ?.name || "—"
                                  } → ${
                                    transaction
                                      .toAccount
                                      ?.name || "—"
                                  }`
                                : transaction
                                    .account
                                    ?.name || "—"}
                            </td>

                            <td>
                              <strong>
                                {formatCurrency(
                                  transaction.amount,
                                  transaction.currency
                                )}
                              </strong>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}