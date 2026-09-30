import { validationResult } from 'express-validator';

/**
 * Middleware to handle express-validator validation errors.
 * Returns 422 with array of field errors if validation fails.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
    }));
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: formatted,
    });
  }
  next();
};

export default validate;
