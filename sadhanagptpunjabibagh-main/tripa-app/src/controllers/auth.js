import UserModel from '../models/User.js';

const authController = {
  /**
   * POST /api/auth/register
   * Register a new driver account.
   */
  register: async (req, res, next) => {
    try {
      const { name, mobile, password, role = 'driver' } = req.body;

      // Check if mobile already registered
      const existing = await UserModel.findByMobile(mobile.trim());
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'An account with this mobile number already exists.',
        });
      }

      // Validate role
      const validRoles = ['driver', 'rider'];
      const userRole = validRoles.includes(role) ? role : 'driver';
      const user = await UserModel.create({ name, mobile, password, role: userRole });
      const token = UserModel.generateToken(user);

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            mobile: user.mobile,
            role: user.role,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/login
   * Authenticate a driver and return JWT.
   */
  login: async (req, res, next) => {
    try {
      const { mobile, password } = req.body;

      const user = await UserModel.findByMobile(mobile.trim());
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid mobile number or password.',
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact support.',
        });
      }

      const isValid = await UserModel.verifyPassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid mobile number or password.',
        });
      }

      const token = UserModel.generateToken(user);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            mobile: user.mobile,
            role: user.role,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/auth/me
   * Get currently authenticated user profile.
   */
  me: async (req, res, next) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      res.json({ success: true, data: { user } });
    } catch (error) {
      next(error);
    }
  },
};

export default authController;
