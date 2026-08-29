const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");
const requireChurch = require("../middleware/tenantMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} = require("../controllers/departmentController");

router.get(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  getDepartments
);

router.get(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  getDepartmentById
);

router.post(
  "/",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  createDepartment
);

router.put(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin", "manager"),
  updateDepartment
);

router.delete(
  "/:id",
  protect,
  requireChurch,
  authorizeRoles("admin"),
  deleteDepartment
);

module.exports = router;