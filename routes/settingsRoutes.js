const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  getSettings,
  updateSettings,
} = require("../controllers/settingsController");

router.get(
  "/",
  protect,
  getSettings
);

router.put(
  "/",
  protect,
  authorizeRoles("admin"),
  updateSettings
);

module.exports = router;