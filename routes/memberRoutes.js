const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const {
  createMember,
  getMembers,
  getMemberById,
  updateMember,
  deleteMember,
} = require("../controllers/memberController");

router.post("/", protect, createMember);
router.get("/", protect, getMembers);
router.get("/:id", protect, getMemberById);
router.put("/:id", protect, updateMember);
router.delete("/:id", protect, deleteMember);

module.exports = router;