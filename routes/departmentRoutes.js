const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  getDepartmentStats,
  getDepartmentWithMembers,
  getDepartmentDetails,
} = require("../controllers/departmentController");

router.post("/", protect, createDepartment);
router.get("/", protect, getDepartments);
router.get("/stats/all", protect, getDepartmentStats);
router.get("/:id/members", protect, getDepartmentWithMembers);
router.get("/:id/details", protect, getDepartmentDetails);
router.get("/:id", protect, getDepartmentById);
router.put("/:id", protect, updateDepartment);
router.delete("/:id", protect, deleteDepartment);

module.exports = router;