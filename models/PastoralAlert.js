
const mongoose = require("mongoose");

// ======================================================
// CONSTANTES
// ======================================================

const ALERT_TYPES = [
  "Absence prolongée",
];

const ALERT_LEVELS = [
  "Attention",
  "À suivre",
  "Critique",
];

const ALERT_STATUSES = [
  "Ouverte",
  "En cours",
  "Résolue",
];

// ======================================================
// SCHÉMA PASTORAL ALERT
// ======================================================

const pastoralAlertSchema = new mongoose.Schema(
  {
    // ==================================================
    // ÉGLISE / MULTITENANT
    // ==================================================

    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      required: true,
      index: true,
    },

    // ==================================================
    // MEMBRE CONCERNÉ
    // ==================================================

    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },

    // ==================================================
    // TYPE D'ALERTE
    // ==================================================

    type: {
      type: String,
      enum: ALERT_TYPES,
      default: "Absence prolongée",
      required: true,
      index: true,
    },

    // ==================================================
    // NIVEAU DE VIGILANCE
    // ==================================================

    level: {
      type: String,
      enum: ALERT_LEVELS,
      default: "Attention",
      required: true,
      index: true,
    },

    // ==================================================
    // PÉRIODE MENSUELLE
    // ==================================================

    // Exemple : "2026-11"
    // Une alerte par membre, par type et par mois.

    periodKey: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      index: true,
    },

    // ==================================================
    // ABSENCES DU MOIS
    // ==================================================

    // Nombre total d'absences explicitement
    // enregistrées avec le statut "Absent".
    //
    // Les statuts "Excusé", "Présent",
    // "En retard" et "Non pointé"
    // ne sont pas comptabilisés.

    absenceCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Cultes dominicaux terminés et clôturés
    // pour lesquels le membre est marqué absent.

    missedServiceIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
      },
    ],

    // Version de recalcul de l'alerte.
    // Permet de suivre les recalculs lorsque
    // les registres sont corrigés puis clôturés.

    detectionRevision: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==================================================
    // COMPATIBILITÉ AVEC L'ANCIEN SYSTÈME
    // ==================================================

    // Conservé pour ne pas casser les anciennes
    // fonctionnalités ou données.
    //
    // Ce champ ne doit plus servir à déterminer
    // le seuil de déclenchement mensuel.

    consecutiveMissedServices: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==================================================
    // DERNIÈRE PRÉSENCE
    // ==================================================

    lastPresenceDate: {
      type: Date,
      default: null,
    },

    lastCheckedServiceDate: {
      type: Date,
      default: null,
    },

    daysSinceLastPresence: {
      type: Number,
      default: null,
      min: 0,
    },

    // ==================================================
    // TRAITEMENT PASTORAL
    // ==================================================

    status: {
      type: String,
      enum: ALERT_STATUSES,
      default: "Ouverte",
      index: true,
    },

    // Responsable chargé du suivi pastoral.

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Notes pastorales.

    note: {
      type: String,
      default: "",
      trim: true,
    },

    // Date du dernier contact avec le membre.

    contactedAt: {
      type: Date,
      default: null,
    },

    // ==================================================
    // RÉSOLUTION
    // ==================================================

    resolvedAt: {
      type: Date,
      default: null,
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ==================================================
    // DÉTECTION AUTOMATIQUE
    // ==================================================

    detectedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    lastDetectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ======================================================
// VALIDATION DES ABSENCES
// ======================================================

pastoralAlertSchema.path("missedServiceIds").validate(
  function (services) {
    if (!Array.isArray(services)) {
      return false;
    }

    const uniqueIds = new Set(
      services.map((id) => String(id))
    );

    return uniqueIds.size === services.length;
  },
  "Un même culte ne peut pas être enregistré plusieurs fois."
);

// ======================================================
// INDEXES
// ======================================================

// Filtrage par église, statut et niveau.

pastoralAlertSchema.index({
  church: 1,
  status: 1,
  level: 1,
});

// Historique mensuel des alertes d'un membre.

pastoralAlertSchema.index({
  church: 1,
  member: 1,
  periodKey: -1,
});

// Répartition des alertes par responsable.

pastoralAlertSchema.index({
  church: 1,
  assignedTo: 1,
  status: 1,
});

// Alertes les plus récentes.

pastoralAlertSchema.index({
  church: 1,
  detectedAt: -1,
});

// Analyse des alertes par mois.

pastoralAlertSchema.index({
  church: 1,
  periodKey: 1,
  status: 1,
});

// ======================================================
// INDEX UNIQUE MENSUEL
// ======================================================

// Une seule alerte du même type par membre,
// par église et par mois.
//
// Exemple :
// Membre A + Église X + Novembre 2026
// => une seule alerte "Absence prolongée".
//
// Décembre 2026 peut produire une nouvelle alerte.

pastoralAlertSchema.index(
  {
    church: 1,
    member: 1,
    type: 1,
    periodKey: 1,
  },
  {
    unique: true,
    name: "unique_monthly_pastoral_alert",
  }
);

// ======================================================
// MÉTHODES DU MODÈLE
// ======================================================

// Vérifier si l'alerte est active.

pastoralAlertSchema.methods.isActive = function () {
  return this.status !== "Résolue";
};

// Vérifier si le seuil mensuel est atteint.

pastoralAlertSchema.methods.hasReachedThreshold =
  function () {
    return this.absenceCount >= 2;
  };

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "PastoralAlert",
  pastoralAlertSchema
);
