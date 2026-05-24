// models/Transaction.js - Transaction schema definition
const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Utilities', 'Education', 'Other'];
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Business', 'Gift', 'Other'];

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // Index for faster queries
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be positive'],
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: [true, 'Transaction type is required'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      default: Date.now,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [200, 'Note cannot exceed 200 characters'],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user+date queries (used in analytics)
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1 });

// Export valid categories for use in validation
transactionSchema.statics.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
transactionSchema.statics.INCOME_CATEGORIES = INCOME_CATEGORIES;

module.exports = mongoose.model('Transaction', transactionSchema);
