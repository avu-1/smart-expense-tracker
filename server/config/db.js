// config/db.js - MongoDB connection using Mongoose
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Accepts both MONGO_URI (our default) and MONGO_URL (Railway's MongoDB service)
    const conn = await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1); // Exit process on DB connection failure
  }
};

module.exports = connectDB;
