const ActivityLog = require(
  "../models/ActivityLog"
);

// ======================================================
// LISTE DES LOGS
// ======================================================

const getActivityLogs = async (
  req,
  res
) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const page =
      parseInt(
        req.query.page,
        10
      ) || 1;

    const limit =
      parseInt(
        req.query.limit,
        10
      ) || 20;

    const skip =
      (page - 1) * limit;

    const {
      search,
      entity,
      action,
      userId,
    } = req.query;

    const filter = {
      church: req.churchId,
    };

    if (entity) {
      filter.entity = entity;
    }

    if (action) {
      filter.action = action;
    }

    if (userId) {
      filter.userId = userId;
    }

    if (search) {
      filter.$or = [
        {
          userName: {
            $regex: search,
            $options: "i",
          },
        },
        {
          description: {
            $regex: search,
            $options: "i",
          },
        },
        {
          entity: {
            $regex: search,
            $options: "i",
          },
        },
        {
          action: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const total =
      await ActivityLog.countDocuments(
        filter
      );

    const logs =
      await ActivityLog.find(
        filter
      )
        .populate(
          "userId",
          "name email role"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit);

    return res.status(200).json({
      success: true,

      page,
      limit,
      total,

      totalPages:
        Math.max(
          1,
          Math.ceil(
            total / limit
          )
        ),

      count:
        logs.length,

      data:
        logs,
    });
  } catch (error) {
    console.error(
      "Erreur getActivityLogs :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

// ======================================================
// SUPPRIMER TOUS LES LOGS DE L'ÉGLISE
// À réserver à l'admin si tu utilises cette route.
// ======================================================

const clearActivityLogs = async (
  req,
  res
) => {
  try {
    if (!req.churchId) {
      return res.status(403).json({
        success: false,
        message:
          "Aucune église associée à cet utilisateur",
      });
    }

    const result =
      await ActivityLog.deleteMany({
        church: req.churchId,
      });

    return res.status(200).json({
      success: true,

      message:
        "Journal d'activité vidé avec succès",

      deletedCount:
        result.deletedCount,
    });
  } catch (error) {
    console.error(
      "Erreur clearActivityLogs :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

module.exports = {
  getActivityLogs,
  clearActivityLogs,
};