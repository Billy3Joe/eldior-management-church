const Church = require("../models/Church");
const Member = require("../models/Member");
const User = require("../models/User");
const Department = require("../models/Department");
const Event = require("../models/Event");

const {
  getPlanConfig,
} = require("../config/planLimits");

// ======================================================
// HELPER : USAGE D'UNE RESSOURCE
// ======================================================

const buildUsage = ({
  current,
  limit,
}) => {
  const unlimited =
    limit === null ||
    typeof limit === "undefined";

  const percentage = unlimited
    ? 0
    : limit > 0
    ? Math.min(
        Number(
          (
            (current / limit) *
            100
          ).toFixed(2)
        ),
        100
      )
    : 100;

  return {
    current,
    limit: unlimited
      ? null
      : limit,

    unlimited,
    percentage,

    remaining: unlimited
      ? null
      : Math.max(
          limit - current,
          0
        ),

    reached:
      !unlimited &&
      current >= limit,
  };
};

// ======================================================
// MON ABONNEMENT
// ======================================================

const getMySubscription = async (
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

    const church =
      await Church.findById(
        req.churchId
      ).select(
        "name slug plan status createdAt updatedAt"
      );

    if (!church) {
      return res.status(404).json({
        success: false,
        message:
          "Église introuvable",
      });
    }

    const plan =
      String(
        church.plan ||
          "free"
      ).toLowerCase();

    const planConfig =
      getPlanConfig(plan);

    const [
      membersCount,
      usersCount,
      departmentsCount,
      eventsCount,
    ] = await Promise.all([
      Member.countDocuments({
        church: req.churchId,
      }),

      User.countDocuments({
        church: req.churchId,
      }),

      Department.countDocuments({
        church: req.churchId,
      }),

      Event.countDocuments({
        church: req.churchId,
      }),
    ]);

    const usage = {
      members: buildUsage({
        current:
          membersCount,

        limit:
          planConfig.limits
            .members,
      }),

      users: buildUsage({
        current:
          usersCount,

        limit:
          planConfig.limits
            .users,
      }),

      departments:
        buildUsage({
          current:
            departmentsCount,

          limit:
            planConfig.limits
              .departments,
        }),

      events: buildUsage({
        current:
          eventsCount,

        limit:
          planConfig.limits
            .events,
      }),
    };

    return res.status(200).json({
      success: true,

      data: {
        church: {
          id:
            church._id,

          name:
            church.name,

          slug:
            church.slug ||
            "",

          status:
            church.status ||
            "active",
        },

        subscription: {
          plan,
          name:
            planConfig.name,

          status:
            church.status ||
            "active",
        },

        limits:
          planConfig.limits,

        features:
          planConfig.features,

        usage,
      },
    });
  } catch (error) {
    console.error(
      "Erreur getMySubscription :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Impossible de récupérer l'abonnement",
    });
  }
};

module.exports = {
  getMySubscription,
};