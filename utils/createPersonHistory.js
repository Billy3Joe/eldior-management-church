const PersonHistory =
  require(
    "../models/PersonHistory"
  );

// ======================================================
// CRÉER UNE ENTRÉE D'HISTORIQUE PERSONNE
// ======================================================

const createPersonHistory =
  async ({
    req,

    churchId = null,

    memberId,

    type,

    category = "Autre",

    title,

    description = "",

    occurredAt = null,

    previousValue = "",

    newValue = "",

    sourceType = "",

    sourceId = null,

    metadata = {},

    origin = "automatic",

    visibility = "standard",

    createdBy = null,

    createdByName = "",
  }) => {
    try {
      // ==================================================
      // ÉGLISE
      // ==================================================

      const resolvedChurchId =
        churchId ||
        req?.churchId ||
        req?.user?.church?._id ||
        req?.user?.church ||
        null;

      // ==================================================
      // AUTEUR
      // ==================================================

      const resolvedUserId =
        createdBy ||
        req?.user?._id ||
        null;

      const resolvedUserName =
        createdByName ||
        req?.user?.name ||
        "Système";

      // ==================================================
      // VALIDATIONS MINIMALES
      // ==================================================

      if (!resolvedChurchId) {
        console.error(
          "createPersonHistory : churchId manquant"
        );

        return null;
      }

      if (!memberId) {
        console.error(
          "createPersonHistory : memberId manquant"
        );

        return null;
      }

      if (!type) {
        console.error(
          "createPersonHistory : type manquant"
        );

        return null;
      }

      if (!title) {
        console.error(
          "createPersonHistory : title manquant"
        );

        return null;
      }

      // ==================================================
      // CRÉATION
      // ==================================================

      const history =
        await PersonHistory.create({
          church:
            resolvedChurchId,

          member:
            memberId,

          type,

          category,

          title:
            title.trim(),

          description:
            typeof description ===
            "string"
              ? description.trim()
              : "",

          occurredAt:
            occurredAt ||
            new Date(),

          previousValue:
            typeof previousValue ===
            "string"
              ? previousValue.trim()
              : previousValue?.toString?.() ||
                "",

          newValue:
            typeof newValue ===
            "string"
              ? newValue.trim()
              : newValue?.toString?.() ||
                "",

          sourceType:
            typeof sourceType ===
            "string"
              ? sourceType.trim()
              : "",

          sourceId:
            sourceId ||
            null,

          metadata:
            metadata &&
            typeof metadata ===
              "object"
              ? metadata
              : {},

          createdBy:
            resolvedUserId,

          createdByName:
            resolvedUserName,

          origin,

          visibility,
        });

      return history;
    } catch (error) {
      // ==================================================
      // IMPORTANT
      //
      // L'historique ne doit jamais faire échouer
      // l'action métier principale.
      // ==================================================

      console.error(
        "Erreur createPersonHistory :",
        error.message
      );

      return null;
    }
  };

// ======================================================
// EXPORT
// ======================================================

module.exports =
  createPersonHistory;