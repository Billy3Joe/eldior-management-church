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

    // ==================================================
    // CLÉ D'IDEMPOTENCE
    //
    // Exemple :
    // first-visit:<memberId>
    // attendance:<attendanceId>
    //
    // Si la clé existe déjà pour cette église,
    // aucun nouvel événement n'est créé.
    // ==================================================

    dedupeKey = null,

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
      // NORMALISATION DEDUPE KEY
      // ==================================================

      const normalizedDedupeKey =
        typeof dedupeKey === "string" &&
        dedupeKey.trim()
          ? dedupeKey.trim()
          : null;

      // ==================================================
      // VÉRIFICATION D'IDEMPOTENCE
      //
      // Cette vérification évite une tentative d'insertion
      // inutile dans la majorité des cas.
      //
      // L'index unique MongoDB reste néanmoins la vraie
      // protection contre les accès concurrents.
      // ==================================================

      if (normalizedDedupeKey) {
        const existingHistory =
          await PersonHistory.findOne({
            church:
              resolvedChurchId,

            dedupeKey:
              normalizedDedupeKey,
          });

        if (existingHistory) {
          return existingHistory;
        }
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
            typeof title === "string"
              ? title.trim()
              : String(title),

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

          dedupeKey:
            normalizedDedupeKey,

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
      // DOUBLON D'IDEMPOTENCE
      //
      // Deux requêtes simultanées peuvent toutes les deux
      // passer le findOne avant que l'une d'elles n'insère.
      //
      // L'index unique MongoDB protège alors la base.
      // Le code 11000 signifie simplement que l'événement
      // existe déjà.
      // ==================================================

      if (
        error?.code === 11000
      ) {
        try {
          const resolvedChurchId =
            churchId ||
            req?.churchId ||
            req?.user?.church?._id ||
            req?.user?.church ||
            null;

          const normalizedDedupeKey =
            typeof dedupeKey ===
              "string" &&
            dedupeKey.trim()
              ? dedupeKey.trim()
              : null;

          if (
            resolvedChurchId &&
            normalizedDedupeKey
          ) {
            const existingHistory =
              await PersonHistory.findOne({
                church:
                  resolvedChurchId,

                dedupeKey:
                  normalizedDedupeKey,
              });

            if (existingHistory) {
              return existingHistory;
            }
          }
        } catch (
          duplicateLookupError
        ) {
          console.error(
            "Erreur récupération historique déjà existant :",
            duplicateLookupError.message
          );
        }

        return null;
      }

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