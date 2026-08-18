const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  confirmAssignment,
  declineAssignment,
  getAssignmentStats,
} = require("../controllers/assignmentController");

router.post("/", protect, createAssignment);

router.get("/", protect, getAssignments);
router.get("/stats/global", protect, getAssignmentStats);

router.put("/:id/confirm", protect, confirmAssignment);
router.put("/:id/decline", protect, declineAssignment);

router.get("/:id", protect, getAssignmentById);
router.put("/:id", protect, updateAssignment);
router.delete("/:id", protect, deleteAssignment);

module.exports = router;