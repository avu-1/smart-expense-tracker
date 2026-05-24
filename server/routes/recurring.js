// routes/recurring.js — Recurring transaction CRUD endpoints
const express = require('express');
const { body } = require('express-validator');
const {
  getRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  toggleRecurring,
  executeNow,
} = require('../controllers/recurringController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect); // All recurring routes require auth

const recurringValidation = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 100 }),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('cycle').isIn(['monthly', 'weekly', 'customDays']).withMessage('Cycle must be monthly, weekly, or customDays'),
  body('interval').optional().isInt({ min: 1 }).withMessage('Interval must be a positive integer'),
  body('startDate').optional().isISO8601().withMessage('Invalid start date'),
  body('endDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid end date'),
  body('note').optional().isLength({ max: 200 }),
];

router.get('/', getRecurring);
router.post('/', recurringValidation, createRecurring);
router.put('/:id', recurringValidation, updateRecurring);
router.delete('/:id', deleteRecurring);
router.post('/:id/toggle', toggleRecurring);       // Pause / resume
router.post('/:id/execute-now', executeNow);        // Manual immediate trigger

module.exports = router;
