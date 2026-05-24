// routes/budget.js
const express = require('express');
const { body } = require('express-validator');
const { getBudget, setBudget, deleteBudget } = require('../controllers/budgetController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', getBudget);
router.post(
  '/',
  [
    body('limit').isNumeric().isFloat({ min: 1 }).withMessage('Budget limit must be a positive number'),
    body('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('Month must be YYYY-MM format'),
  ],
  setBudget
);
router.delete('/:month', deleteBudget);

module.exports = router;
