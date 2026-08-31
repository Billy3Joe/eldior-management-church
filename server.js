// ======================================================
// VARIABLES D'ENVIRONNEMENT
// IMPORTANT : dotenv doit être chargé en premier
// ======================================================

require("dotenv").config();

// ======================================================
// IMPORTS
// ======================================================

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

// ======================================================
// MODÈLES IMPORTÉS EXPLICITEMENT
// ======================================================

require("./models/Church");
require("./models/User");
require("./models/ChurchSettings");

// ======================================================
// SCHEDULER DES RAPPELS
// ======================================================

const startAssignmentReminderJob =
  require("./jobs/assignmentReminderJob");

// ======================================================
// APPLICATION EXPRESS
// ======================================================

const app = express();

// ======================================================
// MIDDLEWARES GLOBAUX
// ======================================================

app.use(cors());

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// ======================================================
// ROUTE DE TEST
// ======================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message:
      "API ElDior Management Church opérationnelle",
  });
});

// ======================================================
// AUTHENTIFICATION
// ======================================================

app.use(
  "/api/auth",
  require("./routes/authRoutes")
);

// ======================================================
// MEMBRES
// ======================================================

app.use(
  "/api/members",
  require("./routes/memberRoutes")
);

// ======================================================
// SUIVI DES VISITEURS
// ======================================================

app.use(
  "/api/visitor-follow-up",
  require("./routes/visitorFollowUpRoutes")
);

// ======================================================
// DÉPARTEMENTS
// ======================================================

app.use(
  "/api/departments",
  require("./routes/departmentRoutes")
);

// ======================================================
// ÉVÉNEMENTS
// ======================================================

app.use(
  "/api/events",
  require("./routes/eventRoutes")
);

// ======================================================
// PRÉSENCES
// ======================================================

app.use(
  "/api/attendances",
  require("./routes/attendanceRoutes")
);

// ======================================================
// PROGRAMMATIONS / AFFECTATIONS
// ======================================================

app.use(
  "/api/assignments",
  require("./routes/assignmentRoutes")
);

// ======================================================
// DASHBOARD ÉGLISE
// ======================================================

app.use(
  "/api/dashboard",
  require("./routes/dashboardRoutes")
);

// ======================================================
// RAPPORTS
// ======================================================

app.use(
  "/api/reports",
  require("./routes/reportRoutes")
);

// ======================================================
// UTILISATEURS D'UNE ÉGLISE
// ======================================================

app.use(
  "/api/users",
  require("./routes/userRoutes")
);

// ======================================================
// JOURNAL D'ACTIVITÉ
// ======================================================

app.use(
  "/api/activity-logs",
  require("./routes/activityLogRoutes")
);

// ======================================================
// PARAMÈTRES DE L'ÉGLISE
// ======================================================

app.use(
  "/api/settings",
  require("./routes/settingsRoutes")
);

// ======================================================
// ABONNEMENT DE L'ÉGLISE
// ======================================================

app.use(
  "/api/subscription",
  require("./routes/subscriptionRoutes")
);

// ======================================================
// ESPACE SUPER ADMIN / PROPRIÉTAIRE ELDIOR
// ======================================================

app.use(
  "/api/platform",
  require("./routes/platformRoutes")
);

// ======================================================
// ROUTE 404
// IMPORTANT : DOIT RESTER APRÈS TOUTES LES ROUTES API
// ======================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message:
      `Route API introuvable : ${req.method} ${req.originalUrl}`,
  });
});

// ======================================================
// GESTION GLOBALE DES ERREURS
// ======================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "❌ ERREUR SERVEUR :",
      err
    );

    return res.status(
      err.status || 500
    ).json({
      success: false,

      message:
        err.message ||
        "Erreur interne du serveur",

      ...(process.env.NODE_ENV ===
      "development"
        ? {
            stack:
              err.stack,
          }
        : {}),
    });
  }
);

// ======================================================
// PORT
// ======================================================

const PORT =
  process.env.PORT ||
  8000;

// ======================================================
// DÉMARRAGE DU SERVEUR
// ======================================================

const startServer =
  async () => {
    try {
      // ==================================================
      // CONNEXION MONGODB
      // ==================================================

      await connectDB();

      console.log(
        "✅ Connexion MongoDB établie"
      );

      // ==================================================
      // DÉMARRAGE HTTP
      // ==================================================

      const server =
        app.listen(
          PORT,

          () => {
            console.log(
              `🚀 Serveur lancé sur le port ${PORT}`
            );

            console.log(
              `🌐 API : http://localhost:${PORT}`
            );

            // ==========================================
            // SCHEDULER MULTI-ÉGLISES
            // ==========================================

            try {
              startAssignmentReminderJob();

              console.log(
                "⏰ Scheduler des rappels lancé"
              );
            } catch (error) {
              console.error(
                "❌ Erreur lancement scheduler :",
                error
              );
            }
          }
        );

      // ==================================================
      // ARRÊT PROPRE
      // ==================================================

      const shutdown =
        (signal) => {
          console.log(
            `\n🛑 Signal ${signal} reçu`
          );

          server.close(
            () => {
              console.log(
                "✅ Serveur HTTP arrêté"
              );

              process.exit(0);
            }
          );
        };

      process.on(
        "SIGINT",

        () => {
          shutdown("SIGINT");
        }
      );

      process.on(
        "SIGTERM",

        () => {
          shutdown("SIGTERM");
        }
      );

      // ==================================================
      // PROMESSES NON GÉRÉES
      // ==================================================

      process.on(
        "unhandledRejection",

        (error) => {
          console.error(
            "❌ Promesse non gérée :",
            error
          );
        }
      );
    } catch (error) {
      console.error(
        "❌ Impossible de démarrer le serveur :",
        error
      );

      process.exit(1);
    }
  };

// ======================================================
// LANCEMENT
// ======================================================

startServer();