// ======================================================
// VARIABLES D'ENVIRONNEMENT
// IMPORTANT : dotenv doit être chargé en premier
// ======================================================

require("dotenv").config();

// ======================================================
// IMPORTS
// ======================================================

const express =
  require("express");

const cors =
  require("cors");

const connectDB =
  require("./config/db");

// ======================================================
// MODÈLES IMPORTÉS EXPLICITEMENT
// ======================================================

require("./models/Church");

require("./models/User");

require("./models/ChurchSettings");

require("./models/Member");

require("./models/Family");

require("./models/PastoralAlert");

require("./models/Group");

// ======================================================
// SCHEDULER DES RAPPELS
// ======================================================

const startAssignmentReminderJob =
  require(
    "./jobs/assignmentReminderJob"
  );

// ======================================================
// APPLICATION EXPRESS
// ======================================================

const app =
  express();

// ======================================================
// MIDDLEWARES GLOBAUX
// ======================================================

app.use(
  cors()
);

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

app.get(
  "/",
  (req, res) => {
    return res
      .status(200)
      .json({
        success: true,
        message:
          "API ElDior Management Church opérationnelle",
      });
  }
);

// ======================================================
// AUTHENTIFICATION
// ======================================================

app.use(
  "/api/auth",
  require(
    "./routes/authRoutes"
  )
);

// ======================================================
// MEMBRES / PERSONNES
// ======================================================

app.use(
  "/api/members",
  require(
    "./routes/memberRoutes"
  )
);

// ======================================================
// FAMILLES / FOYERS
// ======================================================

app.use(
  "/api/families",
  require(
    "./routes/familyRoutes"
  )
);

// ======================================================
// GROUPES / CELLULES
// ======================================================

app.use(
  "/api/groups",
  require(
    "./routes/groupRoutes"
  )
);

// ======================================================
// PARCOURS SPIRITUEL
// ======================================================

app.use(
  "/api/spiritual-journey",
  require(
    "./routes/spiritualJourneyRoutes"
  )
);

// ======================================================
// ALERTES PASTORALES / ABSENCES PROLONGÉES
// ======================================================

app.use(
  "/api/pastoral-alerts",
  require(
    "./routes/pastoralAlertRoutes"
  )
);

// ======================================================
// SUIVI DES VISITEURS
// ======================================================

app.use(
  "/api/visitor-follow-up",
  require(
    "./routes/visitorFollowUpRoutes"
  )
);

// ======================================================
// DÉPARTEMENTS
// ======================================================

app.use(
  "/api/departments",
  require(
    "./routes/departmentRoutes"
  )
);

// ======================================================
// ÉVÉNEMENTS
// ======================================================

app.use(
  "/api/events",
  require(
    "./routes/eventRoutes"
  )
);

// ======================================================
// PRÉSENCES
// ======================================================

app.use(
  "/api/attendances",
  require(
    "./routes/attendanceRoutes"
  )
);

// ======================================================
// PROGRAMMATIONS / AFFECTATIONS
// ======================================================

app.use(
  "/api/assignments",
  require(
    "./routes/assignmentRoutes"
  )
);

// ======================================================
// DASHBOARD ÉGLISE
// ======================================================

app.use(
  "/api/dashboard",
  require(
    "./routes/dashboardRoutes"
  )
);

// ======================================================
// RAPPORTS
// ======================================================

app.use(
  "/api/reports",
  require(
    "./routes/reportRoutes"
  )
);

// ======================================================
// UTILISATEURS
// ======================================================

app.use(
  "/api/users",
  require(
    "./routes/userRoutes"
  )
);

// ======================================================
// JOURNAL D'ACTIVITÉ
// ======================================================

app.use(
  "/api/activity-logs",
  require(
    "./routes/activityLogRoutes"
  )
);

// ======================================================
// PARAMÈTRES
// ======================================================

app.use(
  "/api/settings",
  require(
    "./routes/settingsRoutes"
  )
);

// ======================================================
// ABONNEMENT
// ======================================================

app.use(
  "/api/subscription",
  require(
    "./routes/subscriptionRoutes"
  )
);

// ======================================================
// SUPER ADMIN ELDIOR
// ======================================================

app.use(
  "/api/platform",
  require(
    "./routes/platformRoutes"
  )
);

// ======================================================
// ROUTE 404
// ======================================================

app.use(
  (req, res) => {
    return res
      .status(404)
      .json({
        success: false,
        message:
          `Route API introuvable : ${req.method} ${req.originalUrl}`,
      });
  }
);

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

    return res
      .status(
        err.status ||
          500
      )
      .json({
        success: false,

        message:
          err.message ||
          "Erreur interne du serveur",

        ...(process.env
          .NODE_ENV ===
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
      await connectDB();

      console.log(
        "✅ Connexion MongoDB établie"
      );

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
        () =>
          shutdown(
            "SIGINT"
          )
      );

      process.on(
        "SIGTERM",
        () =>
          shutdown(
            "SIGTERM"
          )
      );

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