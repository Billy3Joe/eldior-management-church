// ======================================================
// VARIABLES D'ENVIRONNEMENT
// IMPORTANT : charger AVANT les autres imports
// ======================================================

const dotenv = require("dotenv");

dotenv.config();

// ======================================================
// IMPORTS
// ======================================================

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");

const startAssignmentReminderJob = require(
  "./jobs/assignmentReminderJob"
);

// Enregistrement explicite de certains modèles utilisés
// avec populate()
require("./models/Church");
require("./models/User");
require("./models/ChurchSettings");

// ======================================================
// APPLICATION EXPRESS
// ======================================================

const app = express();

// ======================================================
// MIDDLEWARES GLOBAUX
// ======================================================

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ======================================================
// ROUTE PRINCIPALE / TEST API
// ======================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "API ElDior Management Church en ligne",
    version: "1.0.0",
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
// PROGRAMMATIONS
// ======================================================

app.use(
  "/api/assignments",
  require("./routes/assignmentRoutes")
);

// ======================================================
// DASHBOARD
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
// UTILISATEURS / ADMINS / MANAGERS
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
// ROUTE 404
// ======================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route API introuvable : ${req.method} ${req.originalUrl}`,
  });
});

// ======================================================
// GESTION GLOBALE DES ERREURS
// ======================================================

app.use((err, req, res, next) => {
  console.error("❌ Erreur serveur :", err);

  return res.status(
    err.status || 500
  ).json({
    success: false,
    message:
      err.message ||
      "Une erreur interne est survenue",
  });
});

// ======================================================
// PORT
// ======================================================

const PORT =
  process.env.PORT ||
  8000;

// ======================================================
// DÉMARRAGE
// ======================================================

const startServer = async () => {
  try {
    // ================================================
    // 1. CONNEXION MONGODB
    // ================================================

    await connectDB();

    // ================================================
    // 2. SERVEUR HTTP
    // ================================================

    const server = app.listen(
      PORT,
      () => {
        console.log(
          `🚀 Serveur lancé sur le port ${PORT}`
        );

        console.log(
          `🌐 API : http://localhost:${PORT}`
        );

        // ============================================
        // 3. SCHEDULER MULTI-ÉGLISES
        // ============================================

        startAssignmentReminderJob();
      }
    );

    // ================================================
    // ARRÊT PROPRE
    // ================================================

    const shutdown = (signal) => {
      console.log(
        `\n🛑 Signal ${signal} reçu`
      );

      server.close(() => {
        console.log(
          "✅ Serveur HTTP arrêté"
        );

        process.exit(0);
      });
    };

    process.on(
      "SIGINT",
      () =>
        shutdown("SIGINT")
    );

    process.on(
      "SIGTERM",
      () =>
        shutdown("SIGTERM")
    );
  } catch (error) {
    console.error(
      "❌ Impossible de démarrer ElDior Management Church :",
      error
    );

    process.exit(1);
  }
};

// ======================================================
// LANCEMENT
// ======================================================

startServer();