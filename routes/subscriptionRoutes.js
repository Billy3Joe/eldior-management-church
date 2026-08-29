const express = require("express");

const router = express.Router();

const protect = require(
  "../middleware/authMiddleware"
);

const requireChurch = require(
  "../middleware/tenantMiddleware"
);

const authorizeRoles = require(
  "../middleware/roleMiddleware"
);

const {
  getMySubscription,
} = require(
  "../controllers/subscriptionController"
);

// ======================================================
// MON ABONNEMENT
// ======================================================

router.get(
  "/me",
  protect,
  requireChurch,
  authorizeRoles(
    "admin",
    "manager"
  ),
  getMySubscription
);

module.exports = router;