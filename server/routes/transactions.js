// routes/transactions.js
const express = require('express');
const { body } = require('express-validator');
const {
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
} = require('../controllers/transactionController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All transaction routes require authentication
router.use(protect);

const transactionValidation = [
  body('amount').isNumeric().isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('date').optional().isISO8601().withMessage('Invalid date format'),
  body('note').optional().isLength({ max: 200 }).withMessage('Note cannot exceed 200 characters'),
];

router.get('/', getTransactions);
router.post('/', transactionValidation, addTransaction);
router.put('/:id', transactionValidation, updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;
