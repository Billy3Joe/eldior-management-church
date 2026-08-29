const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");
const requireChurch = require("../middleware/tenantMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  createMember,
  getMembers,
  getMemberById,
  updateMember,
  deleteMember,
} = require("../controllers/memberController");

// Lecture admin + manager
router.get(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  getMembers
);

router.get(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  getMemberById
);

// Création admin + manager
router.post(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  createMember
);

// Modification admin + manager
router.put(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  updateMember
);

// Suppression admin uniquement
router.delete(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  deleteMember
);

module.exports = router;