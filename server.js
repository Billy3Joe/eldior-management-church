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

// Enregistrement explicite des modèles utilisés en populate
require("./models/Church");
require("./models/User");

// ======================================================
// APPLICATION EXPRESS
// ======================================================

const app = express();

// ======================================================
// MIDDLEWARES
// ======================================================

app.use(cors());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ======================================================
// ROUTE TEST
// ======================================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API ElDior Management Church en ligne",
  });
});

// ======================================================
// ROUTES API
// ======================================================

app.use(
  "/api/auth",
  require("./routes/authRoutes")
);

app.use(
  "/api/members",
  require("./routes/memberRoutes")
);

app.use(
  "/api/events",
  require("./routes/eventRoutes")
);

app.use(
  "/api/attendances",
  require("./routes/attendanceRoutes")
);

app.use(
  "/api/dashboard",
  require("./routes/dashboardRoutes")
);

app.use(
  "/api/departments",
  require("./routes/departmentRoutes")
);

app.use(
  "/api/users",
  require("./routes/userRoutes")
);

app.use(
  "/api/activity-logs",
  require("./routes/activityLogRoutes")
);

app.use(
  "/api/assignments",
  require("./routes/assignmentRoutes")
);

app.use(
  "/api/settings",
  require("./routes/settingsRoutes")
);

// ======================================================
// ROUTE 404
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route API introuvable",
  });
});

// ======================================================
// PORT
// ======================================================

const PORT = process.env.PORT || 8000;

// ======================================================
// DÉMARRAGE SERVEUR
// ======================================================

const startServer = async () => {
  try {
    // Connexion MongoDB
    await connectDB();

    // Démarrage Express
    app.listen(PORT, () => {
      console.log(
        `🚀 Serveur lancé sur le port ${PORT}`
      );

      // Scheduler des rappels
      startAssignmentReminderJob();
    });
  } catch (error) {
    console.error(
      "❌ Impossible de démarrer ElDior Management Church :",
      error.message
    );

    process.exit(1);
  }
};

startServer();