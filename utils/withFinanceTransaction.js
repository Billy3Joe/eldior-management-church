
const mongoose = require("mongoose");

/**
 * Exécute les opérations financières dans
 * une transaction MongoDB atomique.
 *
 * Toutes les écritures doivent utiliser
 * la session transmise au callback.
 */
const withFinanceTransaction = async (operation) => {
  if (typeof operation !== "function") {
    throw new TypeError(
      "Une fonction d'opération financière est obligatoire."
    );
  }

  const session = await mongoose.startSession();

  try {
    return await session.withTransaction(async () => {
      return await operation(session);
    });
  } finally {
    await session.endSession();
  }
};

module.exports = withFinanceTransaction;
