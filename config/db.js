const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log("✅ MongoDB connecté");
    console.log(
      "📦 DB active :",
      mongoose.connection.name
    );
    
    console.log(
      "🔗 Host Mongo :",
      mongoose.connection.host
    );
    
    console.log(
      "🔌 Port Mongo :",
      mongoose.connection.port
    );

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