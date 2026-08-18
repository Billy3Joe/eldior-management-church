const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");


dotenv.config();

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API ElDior Management Church en ligne");
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/members", require("./routes/memberRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/attendances", require("./routes/attendanceRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/departments", require("./routes/departmentRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/activity-logs", require("./routes/activityLogRoutes"));
app.use("/api/assignments", require("./routes/assignmentRoutes"));

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});