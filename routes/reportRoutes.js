const express = require("express");

const router = express.Router();

const protect = require(
  "../middleware/authMiddleware"
);

const requireChurch = require(
  "../middleware/tenantMiddleware"
);

const {
  getGlobalReport,
  getEventReport,
} = require(
  "../controllers/reportController"
);

router.get(
  "/",
  protect,
  requireChurch,
  getGlobalReport
);

router.get(
  "/event/:eventId",
  protect,
  requireChurch,
  getEventReport
);

module.exports = router;