const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/userController");

router.get("/", protect, getUsers);
router.get("/:id", protect, getUserById);
router.post("/", protect, createUser);
router.put("/:id", protect, updateUser);
router.delete("/:id", protect, deleteUser);

module.exports = router;