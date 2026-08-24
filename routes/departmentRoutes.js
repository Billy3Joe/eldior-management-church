const express = require("express");
const router = express.Router();

const protect = require(
  "../middleware/authMiddleware"
);

const requireChurch = require(
  "../middleware/tenantMiddleware"
);

const {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} = require(
  "../controllers/departmentController"
);

router.get(
  "/",
  protect,
  requireChurch,
  getDepartments
);

router.post(
  "/",
  protect,
  requireChurch,
  createDepartment
);

router.get(
  "/:id",
  protect,
  requireChurch,
  getDepartmentById
);

router.put(
  "/:id",
  protect,
  requireChurch,
  updateDepartment
);

router.delete(
  "/:id",
  protect,
  requireChurch,
  deleteDepartment
);

module.exports = router;