const PLAN_LIMITS = {
  free: {
    name: "Free",

    limits: {
      members: 50,
      users: 2,
      departments: 5,
      events: 10,
    },

    features: {
      dashboard: true,

      members: true,
      departments: true,
      events: true,
      attendance: true,

      assignments: false,
      reports: false,

      emailNotifications: false,
      reminders: false,

      activityLogs: false,
      advancedSettings: false,
    },
  },

  standard: {
    name: "Standard",

    limits: {
      members: 300,
      users: 5,
      departments: 20,
      events: 100,
    },

    features: {
      dashboard: true,

      members: true,
      departments: true,
      events: true,
      attendance: true,

      assignments: true,
      reports: true,

      emailNotifications: true,
      reminders: false,

      activityLogs: false,
      advancedSettings: true,
    },
  },

  premium: {
    name: "Premium",

    limits: {
      members: null,
      users: null,
      departments: null,
      events: null,
    },

    features: {
      dashboard: true,

      members: true,
      departments: true,
      events: true,
      attendance: true,

      assignments: true,
      reports: true,

      emailNotifications: true,
      reminders: true,

      activityLogs: true,
      advancedSettings: true,
    },
  },
};

const getPlanConfig = (
  plan
) => {
  const normalizedPlan =
    String(
      plan || "free"
    ).toLowerCase();

  return (
    PLAN_LIMITS[
      normalizedPlan
    ] ||
    PLAN_LIMITS.free
  );
};

module.exports = {
  PLAN_LIMITS,
  getPlanConfig,
};