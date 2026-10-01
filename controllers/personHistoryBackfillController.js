const {
    runPersonHistoryBackfill,
    BACKFILL_VERSION,
  } = require("../services/personHistoryBackfillService");
  
  // ======================================================
  // CONSTANTES
  // ======================================================
  
  const EXECUTION_CONFIRMATION =
    "CONFIRMER_BACKFILL_PERSON_HISTORY";
  
  // ======================================================
  // UTILITAIRES
  // ======================================================
  
  const getChurchIdFromRequest = (req) => {
    return (
      req.churchId ||
      req.user?.church?._id ||
      req.user?.church ||
      null
    );
  };
  
  // ======================================================
  // @desc    Prévisualiser le backfill PersonHistory
  // @route   POST /api/person-history/backfill/preview
  // @access  Admin / Manager
  // ======================================================
  
  const previewPersonHistoryBackfill =
    async (req, res) => {
      try {
        const churchId =
          getChurchIdFromRequest(req);
  
        if (!churchId) {
          return res.status(400).json({
            success: false,
            message:
              "Aucune église active n'a été trouvée pour cette opération.",
          });
        }
  
        const result =
          await runPersonHistoryBackfill({
            churchId,
            dryRun: true,
          });
  
        return res.status(200).json({
          success: true,
  
          message:
            "Prévisualisation du backfill PersonHistory terminée. Aucune donnée n'a été modifiée.",
  
          data: result,
        });
      } catch (error) {
        console.error(
          "❌ Erreur preview PersonHistory backfill :",
          error
        );
  
        return res.status(500).json({
          success: false,
          message:
            "Impossible de prévisualiser le backfill de l'historique des personnes.",
  
          error:
            process.env.NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
      }
    };
  
  // ======================================================
  // @desc    Exécuter réellement le backfill PersonHistory
  // @route   POST /api/person-history/backfill/run
  // @access  Admin / Manager
  // ======================================================
  
  const executePersonHistoryBackfill =
    async (req, res) => {
      try {
        const churchId =
          getChurchIdFromRequest(req);
  
        if (!churchId) {
          return res.status(400).json({
            success: false,
            message:
              "Aucune église active n'a été trouvée pour cette opération.",
          });
        }
  
        // ==================================================
        // PROTECTION CONTRE UNE EXÉCUTION ACCIDENTELLE
        // ==================================================
  
        const confirmation =
          typeof req.body?.confirmation ===
          "string"
            ? req.body.confirmation.trim()
            : "";
  
        if (
          confirmation !==
          EXECUTION_CONFIRMATION
        ) {
          return res.status(400).json({
            success: false,
  
            message:
              "Confirmation obligatoire avant l'exécution réelle du backfill.",
  
            requiredConfirmation:
              EXECUTION_CONFIRMATION,
  
            backfillVersion:
              BACKFILL_VERSION,
          });
        }
  
        // ==================================================
        // EXÉCUTION RÉELLE
        // ==================================================
  
        const result =
          await runPersonHistoryBackfill({
            churchId,
            dryRun: false,
          });
  
        return res.status(200).json({
          success: true,
  
          message:
            "Backfill PersonHistory exécuté avec succès.",
  
          data: result,
        });
      } catch (error) {
        console.error(
          "❌ Erreur exécution PersonHistory backfill :",
          error
        );
  
        return res.status(500).json({
          success: false,
          message:
            "Impossible d'exécuter le backfill de l'historique des personnes.",
  
          error:
            process.env.NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        });
      }
    };
  
  // ======================================================
  // @desc    Informations sur le backfill
  // @route   GET /api/person-history/backfill/info
  // @access  Admin / Manager
  // ======================================================
  
  const getPersonHistoryBackfillInfo =
    async (req, res) => {
      try {
        const churchId =
          getChurchIdFromRequest(req);
  
        if (!churchId) {
          return res.status(400).json({
            success: false,
            message:
              "Aucune église active n'a été trouvée.",
          });
        }
  
        return res.status(200).json({
          success: true,
  
          data: {
            churchId:
              churchId.toString(),
  
            version:
              BACKFILL_VERSION,
  
            executionConfirmation:
              EXECUTION_CONFIRMATION,
  
            modes: {
              preview: {
                dryRun: true,
                writesDatabase: false,
              },
  
              run: {
                dryRun: false,
                writesDatabase: true,
                requiresConfirmation:
                  true,
              },
            },
  
            principles: [
              "Le backfill est limité à l'église active.",
              "La prévisualisation ne modifie aucune donnée.",
              "L'exécution réelle nécessite une confirmation explicite.",
              "Les dedupeKey empêchent les doublons lors des relances.",
              "Les événements déjà existants sont réutilisés lorsque cela est possible.",
              "Aucune donnée historique inexistante n'est inventée.",
            ],
          },
        });
      } catch (error) {
        console.error(
          "❌ Erreur info PersonHistory backfill :",
          error
        );
  
        return res.status(500).json({
          success: false,
          message:
            "Impossible de récupérer les informations du backfill.",
        });
      }
    };
  
  // ======================================================
  // EXPORTS
  // ======================================================
  
  module.exports = {
    previewPersonHistoryBackfill,
    executePersonHistoryBackfill,
    getPersonHistoryBackfillInfo,
  };