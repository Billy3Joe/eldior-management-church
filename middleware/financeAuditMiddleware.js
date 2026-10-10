
const mongoose = require("mongoose");

const FinanceAuditLog = require("../models/FinanceAuditLog");
const FinanceTransaction = require("../models/FinanceTransaction");

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

const financeAuditMiddleware = async (req, res, next) => {
  const action = getAction(req);
  const churchId = getChurchId(req);

  if (!action || !churchId) {
    return next();
  }

  try {
    let before = null;

    if (
      req.params.id &&
      mongoose.Types.ObjectId.isValid(req.params.id)
    ) {
      const existing = await FinanceTransaction.findOne({
        _id: req.params.id,
        church: churchId,
      }).lean();

      before = snapshot(existing);
    }

    const originalJson = res.json.bind(res);

    res.json = function (body) {
      if (
        res.statusCode >= 200 &&
        res.statusCode < 300 &&
        body?.success === true
      ) {
        const transactionId =
          body?.data?._id ||
          before?._id ||
          req.params.id;

        if (
          transactionId &&
          mongoose.Types.ObjectId.isValid(transactionId)
        ) {
          const finalAction =
            action === "confirm" &&
            before?.status === "cancelled"
              ? "reactivate"
              : action;

          // L'audit est indépendant de la réponse HTTP.
          // Les erreurs sont journalisées, jamais ignorées.
          FinanceTransaction.findOne({
            _id: transactionId,
            church: churchId,
          })
            .lean()
            .then((after) =>
              FinanceAuditLog.create({
                church: churchId,
                actor: req.user?._id || null,
                action: finalAction,
                transactionId,
                before,
                after: snapshot(after),
                outcome: "success",
              })
            )
            .catch((error) => {
              console.error(
                "ERREUR AUDIT FINANCIER :",
                error
              );
            });
        }
      }

      return originalJson(body);
    };

    return next();
  } catch (error) {
    console.error(
      "Erreur préparation audit financier :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de préparer la traçabilité financière.",
    });
  }
};

module.exports = financeAuditMiddleware;
