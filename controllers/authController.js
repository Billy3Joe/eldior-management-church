// ======================================================
// IMPORTS
// ======================================================

const jwt = require("jsonwebtoken");

const mongoose =
  require("mongoose");

const User =
  require("../models/User");

const Church =
  require("../models/Church");

const ChurchSettings =
  require("../models/ChurchSettings");

// ======================================================
// NORMALISER UN ID D'ÉGLISE
// ======================================================

const normalizeChurchId =
  (church) => {
    if (!church) {
      return null;
    }

    if (
      typeof church ===
      "string"
    ) {
      return church;
    }

    if (church._id) {
      return church._id.toString();
    }

    return church.toString();
  };

// ======================================================
// CRÉER UN SLUG
// ======================================================

const createSlug = (
  value
) => {
  return String(
    value || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
};

// ======================================================
// TROUVER UN SLUG UNIQUE
// ======================================================

const generateUniqueChurchSlug =
  async (churchName) => {
    let baseSlug =
      createSlug(churchName);

    if (!baseSlug) {
      baseSlug =
        "eglise";
    }

    let slug =
      baseSlug;

    let counter =
      1;

    while (
      await Church.exists({
        slug,
      })
    ) {
      slug =
        `${baseSlug}-${counter}`;

      counter += 1;
    }

    return slug;
  };

// ======================================================
// GÉNÉRER LE JWT
// ======================================================

const generateToken =
  (user) => {
    const churchId =
      normalizeChurchId(
        user.church
      );

    return jwt.sign(
      {
        id:
          user._id.toString(),

        platformRole:
          user.platformRole ||
          "user",

        role:
          user.role ||
          "member",

        churchId,
      },

      process.env.JWT_SECRET,

      {
        expiresIn:
          process.env
            .JWT_EXPIRES_IN ||
          "7d",
      }
    );
  };

// ======================================================
// FORMATTER UTILISATEUR
// ======================================================

const formatUser =
  (user) => {
    if (!user) {
      return null;
    }

    const churchId =
      normalizeChurchId(
        user.church
      );

    return {
      _id:
        user._id,

      name:
        user.name,

      email:
        user.email,

      // ==================================================
      // RÔLE PLATEFORME
      // ==================================================

      platformRole:
        user.platformRole ||
        "user",

      // ==================================================
      // RÔLE DANS L'ÉGLISE
      // ==================================================

      role:
        user.role ||
        "member",

      // ==================================================
      // ÉGLISE ACTIVE
      // ==================================================

      church:
        user.church ||
        null,

      churchId,

      // ==================================================
      // APPARTENANCES
      // ==================================================

      churchMemberships:
        user.churchMemberships ||
        [],

      isActive:
        user.isActive,

      lastLoginAt:
        user.lastLoginAt,

      createdAt:
        user.createdAt,

      updatedAt:
        user.updatedAt,
    };
  };

// ======================================================
// POPULER UTILISATEUR
// ======================================================

const getPopulatedUser =
  async (userId) => {
    return User.findById(
      userId
    )
      .select("-password")
      .populate(
        "church",
        "name slug email phone city country logo plan status isActive"
      )
      .populate(
        "churchMemberships.church",
        "name slug email phone city country logo plan status isActive"
      );
  };

// ======================================================
// INSCRIPTION UTILISATEUR SIMPLE
// ======================================================

const register =
  async (
    req,
    res
  ) => {
    try {
      const {
        name,
        email,
        password,
        role,
        churchId,
      } =
        req.body;

      // ==================================================
      // VALIDATION
      // ==================================================

      if (
        !name ||
        !email ||
        !password
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Nom, email et mot de passe obligatoires",
          });
      }

      if (
        String(
          password
        ).length < 6
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Le mot de passe doit contenir au moins 6 caractères",
          });
      }

      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();

      // ==================================================
      // EMAIL EXISTANT
      // ==================================================

      const existingUser =
        await User.findOne({
          email:
            normalizedEmail,
        });

      if (
        existingUser
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Un compte existe déjà avec cette adresse email",
          });
      }

      // ==================================================
      // RÔLE ÉGLISE
      // ==================================================

      const allowedRoles =
        [
          "admin",
          "manager",
          "member",
        ];

      const churchRole =
        allowedRoles.includes(
          role
        )
          ? role
          : "member";

      // ==================================================
      // ÉGLISE
      // ==================================================

      let church =
        null;

      if (churchId) {
        church =
          await Church.findById(
            churchId
          );

        if (!church) {
          return res
            .status(404)
            .json({
              success:
                false,

              message:
                "Église introuvable",
            });
        }
      }

      // ==================================================
      // CRÉATION UTILISATEUR
      // ==================================================

      const userData = {
        name:
          String(name)
            .trim(),

        email:
          normalizedEmail,

        password,

        // Une route publique ne peut jamais créer un superadmin.
        platformRole:
          "user",

        role:
          churchRole,

        church:
          church
            ? church._id
            : null,

        isActive:
          true,
      };

      if (church) {
        userData.churchMemberships =
          [
            {
              church:
                church._id,

              role:
                churchRole,

              isActive:
                true,

              joinedAt:
                new Date(),
            },
          ];
      }

      const user =
        await User.create(
          userData
        );

      const populatedUser =
        await getPopulatedUser(
          user._id
        );

      const token =
        generateToken(
          populatedUser
        );

      return res
        .status(201)
        .json({
          success:
            true,

          message:
            "Compte créé avec succès",

          token,

          user:
            formatUser(
              populatedUser
            ),
        });
    } catch (error) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Erreur lors de la création du compte",

          error:
            error.message,
        });
    }
  };

// ======================================================
// CRÉATION D'UNE ÉGLISE + ADMINISTRATEUR PRINCIPAL
// ======================================================

const registerChurch =
  async (
    req,
    res
  ) => {
    let createdChurch =
      null;

    let createdUser =
      null;

    try {
      const {
        churchName,
        name,
        email,
        password,
        phone,
        city,
        country,
      } =
        req.body;

      // ==================================================
      // VALIDATION
      // ==================================================

      if (
        !churchName ||
        !String(
          churchName
        ).trim()
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Le nom de l'église est obligatoire",
          });
      }

      if (
        !name ||
        !String(name).trim()
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Le nom du responsable est obligatoire",
          });
      }

      if (
        !email ||
        !String(
          email
        ).trim()
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "L'adresse email est obligatoire",
          });
      }

      if (!password) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Le mot de passe est obligatoire",
          });
      }

      if (
        String(
          password
        ).length < 6
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Le mot de passe doit contenir au moins 6 caractères",
          });
      }

      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();

      // ==================================================
      // VÉRIFIER EMAIL UTILISATEUR
      // ==================================================

      const existingUser =
        await User.findOne({
          email:
            normalizedEmail,
        });

      if (
        existingUser
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Un compte existe déjà avec cette adresse email",
          });
      }

      // ==================================================
      // SLUG UNIQUE
      // ==================================================

      const slug =
        await generateUniqueChurchSlug(
          churchName
        );

      // ==================================================
      // CRÉATION DE L'ÉGLISE
      // ==================================================

      createdChurch =
        await Church.create({
          name:
            String(
              churchName
            ).trim(),

          slug,

          email:
            normalizedEmail,

          phone:
            phone
              ? String(
                  phone
                ).trim()
              : "",

          city:
            city
              ? String(
                  city
                ).trim()
              : "",

          country:
            country
              ? String(
                  country
                ).trim()
              : "France",

          // Toute nouvelle église démarre en Free.
          plan:
            "free",

          status:
            "active",

          isActive:
            true,
        });

      // ==================================================
      // CRÉATION ADMIN PRINCIPAL
      // ==================================================

      createdUser =
        await User.create({
          name:
            String(name)
              .trim(),

          email:
            normalizedEmail,

          password,

          // Il s'agit d'un utilisateur d'une église,
          // pas d'un propriétaire de la plateforme.
          platformRole:
            "user",

          // Le créateur devient administrateur de son église.
          role:
            "admin",

          church:
            createdChurch._id,

          churchMemberships:
            [
              {
                church:
                  createdChurch._id,

                role:
                  "admin",

                isActive:
                  true,

                joinedAt:
                  new Date(),
              },
            ],

          isActive:
            true,
        });

      // ==================================================
      // PARAMÈTRES PAR DÉFAUT DE L'ÉGLISE
      // ==================================================

      try {
        await ChurchSettings.create({
          church:
            createdChurch._id,

          churchName:
            createdChurch.name,

          reminderEnabled:
            true,

          reminderDays:
            [2, 1],

          reminderHour:
            9,

          timezone:
            "Europe/Paris",

          emailNotificationsEnabled:
            true,
        });
      } catch (
        settingsError
      ) {
        // Les settings ne doivent pas empêcher
        // la création du compte si leur création échoue.

        console.error(
          "REGISTER CHURCH SETTINGS ERROR:",
          settingsError.message
        );
      }

      // ==================================================
      // UTILISATEUR COMPLET
      // ==================================================

      const populatedUser =
        await getPopulatedUser(
          createdUser._id
        );

      // ==================================================
      // JWT
      // ==================================================

      const token =
        generateToken(
          populatedUser
        );

      // ==================================================
      // RÉPONSE
      // ==================================================

      return res
        .status(201)
        .json({
          success:
            true,

          message:
            "Votre église a été créée avec succès",

          token,

          user:
            formatUser(
              populatedUser
            ),

          church:
            createdChurch,
        });
    } catch (error) {
      console.error(
        "REGISTER CHURCH ERROR:",
        error
      );

      // ==================================================
      // NETTOYAGE EN CAS D'ÉCHEC PARTIEL
      // ==================================================

      try {
        if (
          createdUser?._id
        ) {
          await User.findByIdAndDelete(
            createdUser._id
          );
        }

        if (
          createdChurch?._id
        ) {
          await ChurchSettings.deleteOne({
            church:
              createdChurch._id,
          });

          await Church.findByIdAndDelete(
            createdChurch._id
          );
        }
      } catch (
        cleanupError
      ) {
        console.error(
          "REGISTER CHURCH CLEANUP ERROR:",
          cleanupError
        );
      }

      // ==================================================
      // DUPLICATION MONGODB
      // ==================================================

      if (
        error.code ===
        11000
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Une information unique existe déjà. Vérifiez notamment l'adresse email.",
          });
      }

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Impossible de créer l'église",

          error:
            error.message,
        });
    }
  };

// ======================================================
// CONNEXION
// ======================================================

const login =
  async (
    req,
    res
  ) => {
    try {
      const {
        email,
        password,
      } =
        req.body;

      // ==================================================
      // VALIDATION
      // ==================================================

      if (
        !email ||
        !password
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Email et mot de passe obligatoires",
          });
      }

      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();

      // ==================================================
      // UTILISATEUR
      // ==================================================

      const user =
        await User.findOne({
          email:
            normalizedEmail,
        })
          .populate(
            "church",
            "name slug email phone city country logo plan status isActive"
          )
          .populate(
            "churchMemberships.church",
            "name slug email phone city country logo plan status isActive"
          );

      if (!user) {
        return res
          .status(401)
          .json({
            success:
              false,

            message:
              "Email ou mot de passe incorrect",
          });
      }

      // ==================================================
      // COMPTE ACTIF
      // ==================================================

      if (
        user.isActive ===
        false
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "Votre compte est désactivé",
          });
      }

      // ==================================================
      // PASSWORD
      // ==================================================

      const passwordMatches =
        await user.matchPassword(
          password
        );

      if (
        !passwordMatches
      ) {
        return res
          .status(401)
          .json({
            success:
              false,

            message:
              "Email ou mot de passe incorrect",
          });
      }

      // ==================================================
      // SUPER ADMIN
      // ==================================================

      const isSuperAdmin =
        user.platformRole ===
        "superadmin";

      if (
        !isSuperAdmin &&
        !user.church
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "Aucune église n'est associée à ce compte",
          });
      }

      // ==================================================
      // ÉGLISE ACTIVE
      // ==================================================

      if (
        user.church &&
        user.church
          .isActive ===
          false &&
        !isSuperAdmin
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "Cette église est actuellement désactivée",
          });
      }

      if (
        user.church &&
        user.church
          .status ===
          "suspended" &&
        !isSuperAdmin
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "Cette église est actuellement suspendue",
          });
      }

      // ==================================================
      // DERNIÈRE CONNEXION
      // ==================================================

      user.lastLoginAt =
        new Date();

      await user.save();

      // ==================================================
      // JWT
      // ==================================================

      const token =
        generateToken(
          user
        );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Connexion réussie",

          token,

          user:
            formatUser(
              user
            ),
        });
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Erreur lors de la connexion",

          error:
            error.message,
        });
    }
  };

// ======================================================
// PROFIL
// ======================================================

const getProfile =
  async (
    req,
    res
  ) => {
    try {
      const user =
        await getPopulatedUser(
          req.user._id
        );

      if (!user) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Utilisateur introuvable",
          });
      }

      return res
        .status(200)
        .json({
          success:
            true,

          user:
            formatUser(
              user
            ),
        });
    } catch (error) {
      console.error(
        "GET PROFILE ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Impossible de récupérer le profil",

          error:
            error.message,
        });
    }
  };

// ======================================================
// MODIFIER PROFIL
// ======================================================

const updateProfile =
  async (
    req,
    res
  ) => {
    try {
      const {
        name,
        email,
      } =
        req.body;

      const user =
        await User.findById(
          req.user._id
        );

      if (!user) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Utilisateur introuvable",
          });
      }

      // ==================================================
      // NOM
      // ==================================================

      if (
        name !== undefined
      ) {
        const normalizedName =
          String(name)
            .trim();

        if (
          !normalizedName
        ) {
          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "Le nom ne peut pas être vide",
            });
        }

        user.name =
          normalizedName;
      }

      // ==================================================
      // EMAIL
      // ==================================================

      if (
        email !==
        undefined
      ) {
        const normalizedEmail =
          String(email)
            .toLowerCase()
            .trim();

        if (
          !normalizedEmail
        ) {
          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "L'adresse email ne peut pas être vide",
            });
        }

        const existingUser =
          await User.findOne({
            email:
              normalizedEmail,

            _id: {
              $ne:
                user._id,
            },
          });

        if (
          existingUser
        ) {
          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "Cette adresse email est déjà utilisée",
            });
        }

        user.email =
          normalizedEmail;
      }

      await user.save();

      const updatedUser =
        await getPopulatedUser(
          user._id
        );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Profil mis à jour",

          user:
            formatUser(
              updatedUser
            ),
        });
    } catch (error) {
      console.error(
        "UPDATE PROFILE ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Impossible de modifier le profil",

          error:
            error.message,
        });
    }
  };

// ======================================================
// CHANGER MOT DE PASSE
// ======================================================

const changePassword =
  async (
    req,
    res
  ) => {
    try {
      const {
        currentPassword,
        newPassword,
      } =
        req.body;

      if (
        !currentPassword ||
        !newPassword
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Ancien et nouveau mot de passe obligatoires",
          });
      }

      if (
        String(
          newPassword
        ).length < 6
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Le nouveau mot de passe doit contenir au moins 6 caractères",
          });
      }

      const user =
        await User.findById(
          req.user._id
        );

      if (!user) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Utilisateur introuvable",
          });
      }

      const passwordMatches =
        await user.matchPassword(
          currentPassword
        );

      if (
        !passwordMatches
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Le mot de passe actuel est incorrect",
          });
      }

      user.password =
        newPassword;

      await user.save();

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Mot de passe modifié avec succès",
        });
    } catch (error) {
      console.error(
        "CHANGE PASSWORD ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Impossible de modifier le mot de passe",

          error:
            error.message,
        });
    }
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  register,
  registerChurch,
  login,
  getProfile,
  updateProfile,
  changePassword,
};