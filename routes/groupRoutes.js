const express =
  require("express");

const router =
  express.Router();

const protect =
  require("../middleware/authMiddleware");

const tenantMiddleware =
  require("../middleware/tenantMiddleware");

const {
  createGroup,
  getGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  addMemberToGroup,
  updateGroupMember,
  removeMemberFromGroup,
  getMemberGroups,
  getGroupStats,
} = require("../controllers/groupController");

// ======================================================
// SÉCURITÉ
// ======================================================

router.use(protect);

router.use(
  tenantMiddleware
);

// ======================================================
// ROUTES GLOBALES
// ======================================================

router.get(
  "/stats",
  getGroupStats
);

router.get(
  "/member/:memberId",
  getMemberGroups
);

router
  .route("/")
  .get(getGroups)
  .post(createGroup);

// ======================================================
// MEMBRES D'UN GROUPE
// ======================================================

router.post(
  "/:id/members",
  addMemberToGroup
);

router.put(
  "/:id/members/:memberId",
  updateGroupMember
);

router.delete(
  "/:id/members/:memberId",
  removeMemberFromGroup
);

// ======================================================
// GROUPE
// ======================================================

router
  .route("/:id")
  .get(getGroupById)
  .put(updateGroup)
  .delete(deleteGroup);

module.exports =
  router;