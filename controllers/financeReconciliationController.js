const mongoose = require("mongoose");

const {
  reconcileAccount,
  reconcileChurchAccounts,
  repairAccountBalance,
} = require("../services/financeReconciliationService");

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(value);
};

const getChurchId = (req) => {
  return req.churchId || req.user?.church?._id || req.user?.church;
};

// ======================================================
// GET
// /api/finance/reconciliation
//
// Réconciliation de tous les comptes financiers
// de l'église courante.
// ======================================================

const getChurchReconciliation = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId || !isValidObjectId(churchId)) {
      return res.status(400).json({
        success: false,
        message: "Église invalide ou introuvable.",
      });
    }

    const reconciliation = await reconcileChurchAccounts({
      churchId,
    });

    return res.status(200).json({
      success: true,
      message: reconciliation.isBalanced
        ? "Tous les comptes financiers sont équilibrés."
        : "Des écarts financiers ont été détectés.",
      data: reconciliation,
    });
  } catch (error) {
    console.error(
      "Erreur getChurchReconciliation :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Une erreur est survenue lors de la réconciliation financière.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

// ======================================================
// GET
// /api/finance/reconciliation/accounts/:accountId
//
// Réconciliation d'un compte précis.
// ======================================================

const getAccountReconciliation = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const { accountId } = req.params;

    if (!churchId || !isValidObjectId(churchId)) {
      return res.status(400).json({
        success: false,
        message: "Église invalide ou introuvable.",
      });
    }

    if (!accountId || !isValidObjectId(accountId)) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant du compte financier invalide.",
      });
    }

    const reconciliation = await reconcileAccount({
      churchId,
      accountId,
    });

    if (!reconciliation) {
      return res.status(404).json({
        success: false,
        message:
          "Compte financier introuvable pour cette église.",
      });
    }

    return res.status(200).json({
      success: true,
      message: reconciliation.isBalanced
        ? "Le compte financier est équilibré."
        : "Un écart financier a été détecté sur ce compte.",
      data: reconciliation,
    });
  } catch (error) {
    console.error(
      "Erreur getAccountReconciliation :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Une erreur est survenue lors de la réconciliation du compte.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

// ======================================================
// POST
// /api/finance/reconciliation/accounts/:accountId/repair
//
// Répare explicitement le currentBalance du compte
// en utilisant le solde théorique calculé à partir
// des transactions confirmées.
//
// IMPORTANT :
// Cette route devra être réservée aux administrateurs.
// ======================================================

const repairAccountReconciliation = async (
  req,
  res
) => {
  try {
    const churchId = getChurchId(req);
    const { accountId } = req.params;

    if (!churchId || !isValidObjectId(churchId)) {
      return res.status(400).json({
        success: false,
        message: "Église invalide ou introuvable.",
      });
    }

    if (!accountId || !isValidObjectId(accountId)) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant du compte financier invalide.",
      });
    }

    const result = await repairAccountBalance({
      churchId,
      accountId,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message:
          "Compte financier introuvable pour cette église.",
      });
    }

    // ==================================================
    // LE COMPTE ÉTAIT DÉJÀ ÉQUILIBRÉ
    // ==================================================

    if (!result.repaired) {
      return res.status(200).json({
        success: true,
        message:
          "Aucune correction nécessaire. Le compte est déjà équilibré.",
        data: result,
      });
    }

    // ==================================================
    // CORRECTION EFFECTUÉE
    // ==================================================

    return res.status(200).json({
      success: true,
      message:
        "Le solde du compte financier a été réconcilié avec succès.",
      data: result,
    });
  } catch (error) {
    console.error(
      "Erreur repairAccountReconciliation :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Une erreur est survenue lors de la réparation du solde financier.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getChurchReconciliation,
  getAccountReconciliation,
  repairAccountReconciliation,
};