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
  
  } catch (emailError) {
    console.error("=== ERREUR EMAIL PROGRAMMATION ===");
    console.error("Message :", emailError.message);
    console.error("Code :", emailError.code);
    console.error("Response :", emailError.response);
    console.error("Command :", emailError.command);
    console.error("Stack :", emailError.stack);
  
    assignment.emailStatus = "failed";
    await assignment.save();
  }
  }

module.exports = createActivityLog;