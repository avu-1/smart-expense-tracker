// models/Budget.js - Monthly budget schema
const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    limit: {
      type: Number,
      required: [true, 'Budget limit is required'],
      min: [1, 'Budget limit must be positive'],
    },
    month: {
      type: String, // Format: "YYYY-MM" e.g. "2024-01"
      required: [true, 'Month is required'],
      match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'],
    },
  },
  {
    timestamps: true,
  }
);

// One budget per user per month
budgetSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
