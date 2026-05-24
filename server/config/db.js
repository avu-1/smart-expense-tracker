// config/db.js - MongoDB connection using Mongoose
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // BUG-N1 FIX: removed deprecated useNewUrlParser / useUnifiedTopology options
    // (they have no effect since Mongoose v7 / MongoDB Driver v4 and cause startup warnings)
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1); // Exit process on DB connection failure
  }
};

module.exports = connectDB;
