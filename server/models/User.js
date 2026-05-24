// models/User.js - User schema definition (UPGRADED for SpendWise)
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // BUG-12 FIX: never return password unless explicitly requested with .select('+password')
    },
    currency: {
      type: String,
      default: '₹', // Default to Indian Rupee
    },

    // UPGRADE: Store hashed refresh tokens (one per device/session)
    // select:false means this field is never returned unless explicitly requested
    refreshTokens: {
      type: [String],
      default: [],
      select: false,
    },

    // Per-user notification preferences
    emailNotifications: {
      budgetAlert:          { type: Boolean, default: true },
      billReminder:         { type: Boolean, default: true },
      transactionConfirm:   { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

// Strip sensitive fields before sending to client
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.refreshTokens;
  return user;
};

module.exports = mongoose.model('User', userSchema);
