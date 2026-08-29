const ActivityLog = require(
  "../models/ActivityLog"
);

const createActivityLog = async ({
  req,
  action,
  entity,
  entityId = "",
  description = "",
}) => {
  try {
    const churchId =
      req?.churchId ||
      req?.user?.church?._id ||
      req?.user?.church ||
      null;

    const userId =
      req?.user?._id ||
      null;

    const userName =
      req?.user?.name ||
      "Système";

    await ActivityLog.create({
      church:
        churchId || null,

      userId,

      userName,

      action,

      entity,

      entityId:
        entityId?.toString?.() ||
        entityId ||
        "",

      description:
        description || "",
    });
  } catch (error) {
    // On évite de faire planter une requête principale
    // uniquement parce que le journal n'a pas pu être écrit.
    console.error(
      "Erreur createActivityLog :",
      error.message
    );
  }
};

module.exports =
  createActivityLog;