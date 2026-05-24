// models/RecurringTransaction.js
// Stores templates for automatically repeating income/expense transactions.
// The cron scheduler reads this collection daily and fires real Transactions.

const mongoose = require('mongoose');

const recurringTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Human-readable name shown in UI (e.g. "Netflix", "Home Rent", "EMI - Car")
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },

    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be positive'],
    },

    type: {
      type: String,
      enum: ['income', 'expense'],
      required: [true, 'Type is required'],
    },

    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },

    // When this recurring series started
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
      default: Date.now,
    },

    // Recurrence pattern
    // 'monthly'    → every N months
    // 'weekly'     → every N weeks
    // 'customDays' → every N calendar days
    cycle: {
      type: String,
      enum: ['monthly', 'weekly', 'customDays'],
      required: [true, 'Cycle is required'],
      default: 'monthly',
    },

    // Multiplier for the cycle:
    //   cycle=monthly,  interval=1  → every month
    //   cycle=monthly,  interval=3  → every quarter
    //   cycle=weekly,   interval=2  → every 2 weeks
    //   cycle=customDays, interval=45 → every 45 days
    interval: {
      type: Number,
      required: true,
      min: [1, 'Interval must be at least 1'],
      default: 1,
    },

    // Cron scheduler updates this after each execution
    nextExecutionDate: {
      type: Date,
      required: true,
    },

    // Soft-disable without deleting the record
    isActive: {
      type: Boolean,
      default: true,
    },

    // Optional note appended to generated transactions
    note: {
      type: String,
      trim: true,
      maxlength: [200, 'Note cannot exceed 200 characters'],
      default: '',
    },

    // Optional end date — when set, the cron scheduler will NOT fire after this date
    // and will automatically set isActive=false so the record is clearly marked "ended".
    // Leave null for indefinite (e.g. subscriptions with no end date).
    endDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for the daily cron query: find all active records due today or earlier
recurringTransactionSchema.index({ isActive: 1, nextExecutionDate: 1 });

module.exports = mongoose.model('RecurringTransaction', recurringTransactionSchema);
