const Church =
  require("../models/Church");

const User =
  require("../models/User");

const Member =
  require("../models/Member");

const Event =
  require("../models/Event");

const Department =
  require("../models/Department");

// ======================================================
// DASHBOARD GLOBAL DE LA PLATEFORME
// ======================================================

const getPlatformDashboard = async (
  req,
  res
) => {
  try {
    // ==================================================
    // ÉGLISES
    // ==================================================

    const [
      totalChurches,
      activeChurches,
      suspendedChurches,

      freeChurches,
      standardChurches,
      premiumChurches,

      totalUsers,
      totalMembers,
      totalEvents,
      totalDepartments,
    ] = await Promise.all([
      Church.countDocuments(),

      Church.countDocuments({
        isActive: true,
        status: "active",
      }),

      Church.countDocuments({
        $or: [
          {
            isActive: false,
          },
          {
            status: "suspended",
          },
        ],
      }),

      Church.countDocuments({
        plan: "free",
      }),

      Church.countDocuments({
        plan: "standard",
      }),

      Church.countDocuments({
        plan: "premium",
      }),

      User.countDocuments({
        platformRole: {
          $ne: "superadmin",
        },
      }),

      Member.countDocuments(),

      Event.countDocuments(),

      Department.countDocuments(),
    ]);

    // ==================================================
    // DERNIÈRES ÉGLISES
    // ==================================================

    const recentChurches =
      await Church.find()
        .sort({
          createdAt: -1,
        })
        .limit(8)
        .select(
          "name slug email phone city country plan status isActive createdAt"
        )
        .lean();

    // ==================================================
    // RÉPARTITION DES PLANS
    // ==================================================

    const planDistribution = [
      {
        plan: "free",
        label: "Free",
        total: freeChurches,
      },

      {
        plan: "standard",
        label: "Standard",
        total: standardChurches,
      },

      {
        plan: "premium",
        label: "Premium",
        total: premiumChurches,
      },
    ];

    return res.status(200).json({
      success: true,

      data: {
        overview: {
          totalChurches,
          activeChurches,
          suspendedChurches,
          totalUsers,
          totalMembers,
          totalEvents,
          totalDepartments,
        },

        subscriptions: {
          free: freeChurches,
          standard:
            standardChurches,
          premium:
            premiumChurches,
        },

        planDistribution,

        recentChurches,
      },
    });
  } catch (error) {
    console.error(
      "PLATFORM DASHBOARD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Impossible de charger le tableau de bord de la plateforme",

      error:
        error.message,
    });
  }
};

// ======================================================
// LISTE DE TOUTES LES ÉGLISES
// ======================================================

const getChurches = async (
  req,
  res
) => {
  try {
    const {
      search = "",
      plan = "",
      status = "",
      page = 1,
      limit = 20,
    } = req.query;

    const filters = {};

    // ==================================================
    // RECHERCHE
    // ==================================================

    if (search) {
      filters.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },

        {
          email: {
            $regex: search,
            $options: "i",
          },
        },

        {
          city: {
            $regex: search,
            $options: "i",
          },
        },

        {
          country: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    // ==================================================
    // PLAN
    // ==================================================

    if (
      [
        "free",
        "standard",
        "premium",
      ].includes(plan)
    ) {
      filters.plan = plan;
    }

    // ==================================================
    // STATUT
    // ==================================================

    if (status) {
      filters.status =
        status;
    }

    const numericPage =
      Math.max(
        Number(page) || 1,
        1
      );

    const numericLimit =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );

    const skip =
      (numericPage - 1) *
      numericLimit;

    // ==================================================
    // REQUÊTES
    // ==================================================

    const [
      churches,
      total,
    ] = await Promise.all([
      Church.find(filters)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(numericLimit)
        .select(
          "name slug email phone city country plan status isActive createdAt updatedAt"
        )
        .lean(),

      Church.countDocuments(
        filters
      ),
    ]);

    // ==================================================
    // STATISTIQUES PAR ÉGLISE
    // ==================================================

    const enrichedChurches =
      await Promise.all(
        churches.map(
          async (church) => {
            const [
              members,
              users,
              events,
              departments,
            ] = await Promise.all([
              Member.countDocuments({
                church:
                  church._id,
              }),

              User.countDocuments({
                church:
                  church._id,
              }),

              Event.countDocuments({
                church:
                  church._id,
              }),

              Department.countDocuments({
                church:
                  church._id,
              }),
            ]);

            return {
              ...church,

              usage: {
                members,
                users,
                events,
                departments,
              },
            };
          }
        )
      );

    return res.status(200).json({
      success: true,

      data:
        enrichedChurches,

      pagination: {
        page:
          numericPage,

        limit:
          numericLimit,

        total,

        totalPages:
          Math.max(
            Math.ceil(
              total /
                numericLimit
            ),
            1
          ),
      },
    });
  } catch (error) {
    console.error(
      "GET PLATFORM CHURCHES ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Impossible de récupérer les églises",

      error:
        error.message,
    });
  }
};

// ======================================================
// UNE ÉGLISE
// ======================================================

const getChurchById = async (
  req,
  res
) => {
  try {
    const church =
      await Church.findById(
        req.params.id
      ).lean();

    if (!church) {
      return res.status(404).json({
        success: false,
        message:
          "Église introuvable",
      });
    }

    const [
      members,
      users,
      events,
      departments,
    ] = await Promise.all([
      Member.countDocuments({
        church: church._id,
      }),

      User.countDocuments({
        church: church._id,
      }),

      Event.countDocuments({
        church: church._id,
      }),

      Department.countDocuments({
        church: church._id,
      }),
    ]);

    return res.status(200).json({
      success: true,

      data: {
        ...church,

        usage: {
          members,
          users,
          events,
          departments,
        },
      },
    });
  } catch (error) {
    console.error(
      "GET PLATFORM CHURCH ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer cette église",
      error:
        error.message,
    });
  }
};

// ======================================================
// MODIFIER PLAN / STATUT
// ======================================================

const updateChurch = async (
  req,
  res
) => {
  try {
    const {
      plan,
      status,
      isActive,
    } = req.body;

    const church =
      await Church.findById(
        req.params.id
      );

    if (!church) {
      return res.status(404).json({
        success: false,
        message:
          "Église introuvable",
      });
    }

    if (
      plan !== undefined
    ) {
      if (
        ![
          "free",
          "standard",
          "premium",
        ].includes(plan)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Plan invalide",
        });
      }

      church.plan = plan;
    }

    if (
      status !== undefined
    ) {
      if (
        ![
          "active",
          "suspended",
          "cancelled",
        ].includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Statut invalide",
        });
      }

      church.status =
        status;
    }

    if (
      typeof isActive ===
      "boolean"
    ) {
      church.isActive =
        isActive;
    }

    await church.save();

    return res.status(200).json({
      success: true,

      message:
        "Église mise à jour avec succès",

      data: church,
    });
  } catch (error) {
    console.error(
      "UPDATE PLATFORM CHURCH ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de modifier cette église",
      error:
        error.message,
    });
  }
};

module.exports = {
  getPlatformDashboard,
  getChurches,
  getChurchById,
  updateChurch,
};