const ActivityLog = require("../models/ActivityLog");

const createActivityLog = async ({
  req,
  action,
  entity,
  entityId = "",
  description = "",
}) => {
  try {
    await ActivityLog.create({
      userId: req.user?._id,
      userName: req.user?.name || "Système",
      action,
      entity,
      entityId,
      description,
    });
  } catch (error) {
    console.error("Erreur ActivityLog :", error.message);
  }
};

module.exports = createActivityLog;