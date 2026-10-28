
const mongoose = require("mongoose");

const FinanceAuditLog = require("../models/FinanceAuditLog");
const FinanceTransaction = require("../models/FinanceTransaction");

// ======================================================
// ACTIONS FINANCIÈRES
// ======================================================

const ACTIONS = {
  POST: "create",
  PUT: "update",
  DELETE: "delete",
};

const getChurchId = (req) =>
  req.churchId ||
  req.user?.church?._id ||
  req.user?.church ||
  null;

const getAction = (req) => {
  if (req.method === "PATCH") {
    if (req.path.endsWith("/confirm")) {
      return "confirm";
    }

    if (req.path.endsWith("/cancel")) {
      return "cancel";
    }
  }

  return ACTIONS[req.method] || null;
};

const snapshot = (document) => {
  if (!document) return null;

  const data =
    typeof document.toObject === "function"
      ? document.toObject()
      : { ...document };

  return JSON.parse(JSON.stringify(data));
};

const logError = (error) => {
  console.error(
    "[FINANCE AUDIT] Erreur de journalisation :",
    error
  );
};

// ======================================================
// MIDDLEWARE D'AUDIT FINANCIER
// ======================================================

const financeAuditMiddleware = async (req, res, next) => {
  const action = getAction(req);
  const churchId = getChurchId(req);

  if (!action) {
    return next();
  }

  if (!churchId) {
    return res.status(403).json({
      success: false,
      message: "Église non identifiée.",
    });
  }

  try {
    const actor = req.user?._id || null;

    let before = null;
    let pendingAudit = null;

    const transactionId = req.params.id;

    // ==================================================
    // CAPTURE DE L'ÉTAT INITIAL
    // ==================================================

    if (
      transactionId &&
      mongoose.Types.ObjectId.isValid(transactionId)
    ) {
      const existing = await FinanceTransaction.findOne({
        _id: transactionId,
        church: churchId,
      }).lean();

      before = snapshot(existing);
    }

    const finalAction =
      action === "confirm" &&
      before?.status === "cancelled"
        ? "reactivate"
        : action;

    // ==================================================
    // TRACE PRÉALABLE POUR LES TRANSACTIONS EXISTANTES
    // ==================================================
    // On enregistre "pending" AVANT l'opération.
    // En particulier, une suppression ne peut pas
    // démarrer si cette trace n'a pas été créée.
    // ==================================================

    if (
      before &&
      transactionId &&
      mongoose.Types.ObjectId.isValid(transactionId)
    ) {
      pendingAudit = await FinanceAuditLog.create({
        church: churchId,
        actor,
        action: finalAction,
        transactionId,
        before,
        after: null,
        outcome: "pending",
      });
    }

    // ==================================================
    // INTERCEPTION DE LA RÉPONSE
    // ==================================================

    const originalJson = res.json.bind(res);

    res.json = function (body) {
      const succeeded =
        res.statusCode >= 200 &&
        res.statusCode < 300 &&
        body?.success === true;

      // Restauration de la méthode originale.
      res.json = originalJson;

      const finalizeAudit = async () => {
        try {
          if (pendingAudit) {
            if (!succeeded) {
              await FinanceAuditLog.updateOne(
                { _id: pendingAudit._id },
                {
                  $set: {
                    outcome: "failed",
                    errorMessage:
                      body?.message ||
                      `HTTP ${res.statusCode}`,
                  },
                }
              );

              return;
            }

            const after = await FinanceTransaction.findOne({
              _id: transactionId,
              church: churchId,
            }).lean();

            await FinanceAuditLog.updateOne(
              { _id: pendingAudit._id },
              {
                $set: {
                  outcome: "success",
                  after: snapshot(after),
                  errorMessage: "",
                },
              }
            );

            return;
          }

          // Création : l'identifiant est disponible
          // après l'enregistrement de la transaction.

          if (!succeeded || action !== "create") {
            return;
          }

          const createdId =
            body?.data?._id ||
            body?.data?.transaction?._id ||
            body?.transaction?._id;

          if (
            !createdId ||
            !mongoose.Types.ObjectId.isValid(createdId)
          ) {
            console.error(
              "[FINANCE AUDIT] Identifiant de création introuvable."
            );

            return;
          }

          const after = await FinanceTransaction.findOne({
            _id: createdId,
            church: churchId,
          }).lean();

          await FinanceAuditLog.create({
            church: churchId,
            actor,
            action: "create",
            transactionId: createdId,
            before: null,
            after: snapshot(after),
            outcome: "success",
          });
        } catch (error) {
          logError(error);
        }
      };

      // Le journal est finalisé indépendamment
      // de l'envoi de la réponse au client.
      void finalizeAudit();

      return originalJson(body);
    };

    return next();
  } catch (error) {
    logError(error);

    return res.status(500).json({
      success: false,
      message:
        "Impossible de préparer la traçabilité financière.",
    });
  }
};

module.exports = financeAuditMiddleware;
