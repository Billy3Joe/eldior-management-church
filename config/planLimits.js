const PLAN_LIMITS = {
  // ======================================================
  // FREE
  // ======================================================

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

  // ======================================================
  // STANDARD
  // ======================================================

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

  // ======================================================
  // PREMIUM
  // ======================================================

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

// ======================================================
// RÉCUPÉRER LA CONFIGURATION D'UN PLAN
// ======================================================

const getPlanConfig = (plan) => {
  const normalizedPlan = String(
    plan || "free"
  )
    .trim()
    .toLowerCase();

  return (
    PLAN_LIMITS[normalizedPlan] ||
    PLAN_LIMITS.free
  );
};

// ======================================================
// VÉRIFIER SI UN PLAN EXISTE
// ======================================================

const isValidPlan = (plan) => {
  if (!plan) {
    return false;
  }

  const normalizedPlan = String(plan)
    .trim()
    .toLowerCase();

  return Object.prototype.hasOwnProperty.call(
    PLAN_LIMITS,
    normalizedPlan
  );
};

// ======================================================
// RÉCUPÉRER UNE LIMITE
// ======================================================

const getPlanLimit = (
  plan,
  resource
) => {
  const config =
    getPlanConfig(plan);

  return config?.limits?.[
    resource
  ];
};

// ======================================================
// VÉRIFIER UNE FONCTIONNALITÉ
// ======================================================

const hasPlanFeature = (
  plan,
  feature
) => {
  const config =
    getPlanConfig(plan);

  return (
    config?.features?.[
      feature
    ] === true
  );
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  PLAN_LIMITS,
  getPlanConfig,
  isValidPlan,
  getPlanLimit,
  hasPlanFeature,
};