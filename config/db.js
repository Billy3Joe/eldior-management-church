const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log("✅ MongoDB connecté");

    return connection;
  } catch (error) {
    console.error(
      "❌ Erreur MongoDB :",
      error.message
    );

    throw error;
  }
};

module.exports = connectDB;