import { body } from 'express-validator';

// ─── Validation Schemas ───────────────────────────────────────────────────────

export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 120 }).withMessage('Name must be 2-120 characters'),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required')
    .matches(/^[+]?[\d\s\-().]{8,20}$/).withMessage('Enter a valid mobile number'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

export const loginValidation = [
  body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const createRideValidation = [
  body('vehicleName').trim().notEmpty().withMessage('Vehicle name is required'),
  body('vehicleNumber').optional().trim(),
  body('fromLocation').trim().notEmpty().withMessage('From location is required'),
  body('toLocation').trim().notEmpty().withMessage('To location is required'),
  body('travelDate').notEmpty().withMessage('Travel date is required')
    .isDate().withMessage('Travel date must be a valid date (YYYY-MM-DD)'),
  body('bookingFrequency').optional().isIn(['today_only', 'every_day', 'week_days', 'specific_date']).withMessage('Invalid booking frequency'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('priceMode').optional().isIn(['fixed', 'negotiable']).withMessage('Price mode must be fixed or negotiable'),
  body('maxLuggage').optional().isIn(['none', 'small', 'medium', 'large']).withMessage('Invalid max luggage value'),
];

export const updateRideValidation = [
  body('travelDate').optional().isDate().withMessage('Travel date must be a valid date'),
  body('bookingFrequency').optional().isIn(['today_only', 'every_day', 'week_days', 'specific_date']),
  body('price').optional().isFloat({ min: 0 }),
  body('priceMode').optional().isIn(['fixed', 'negotiable']),
  body('maxLuggage').optional().isIn(['none', 'small', 'medium', 'large']),
  body('status').optional().isIn(['active', 'inactive', 'completed', 'cancelled']),
];
