// config/seed.js - Seeds the database with sample data for testing
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./db');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

const seedData = async () => {
  await connectDB();

  // Clear existing data
  await User.deleteMany({});
  await Transaction.deleteMany({});
  await Budget.deleteMany({});

  console.log('🗑️  Cleared existing data');

  // Create demo user
  const hashedPassword = await bcrypt.hash('demo123', 12);
  const user = await User.create({
    name: 'Alex Johnson',
    email: 'demo@example.com',
    password: hashedPassword,
  });

  console.log('👤 Created demo user: demo@example.com / demo123');

  // Generate transactions for last 3 months
  const categories = {
    expense: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Utilities', 'Education'],
    income: ['Salary', 'Freelance', 'Investment', 'Other'],
  };

  const transactions = [];
  const now = new Date();

  // Generate 60 sample transactions
  for (let i = 0; i < 60; i++) {
    const isExpense = Math.random() > 0.3;
    const type = isExpense ? 'expense' : 'income';
    const catList = categories[type];
    const category = catList[Math.floor(Math.random() * catList.length)];

    // Random date within last 3 months
    const daysAgo = Math.floor(Math.random() * 90);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);

    let amount;
    if (type === 'income') {
      amount = category === 'Salary' ? 50000 + Math.random() * 10000 : 5000 + Math.random() * 20000;
    } else {
      const ranges = {
        Food: [200, 2000], Transport: [100, 1500], Shopping: [500, 5000],
        Entertainment: [300, 3000], Health: [500, 5000], Utilities: [1000, 5000], Education: [1000, 10000],
      };
      const [min, max] = ranges[category] || [100, 2000];
      amount = min + Math.random() * (max - min);
    }

    transactions.push({
      userId: user._id,
      amount: Math.round(amount),
      type,
      category,
      date,
      note: `Sample ${type} - ${category}`,
    });
  }

  await Transaction.insertMany(transactions);
  console.log('💰 Created 60 sample transactions');

  // Create budget for current month
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await Budget.create({
    userId: user._id,
    limit: 50000,
    month: currentMonth,
  });

  console.log('📊 Created sample budget: ₹50,000 for current month');
  console.log('\n✅ Database seeded successfully!');
  console.log('🚀 Login with: demo@example.com / demo123');

  process.exit(0);
};

seedData().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
