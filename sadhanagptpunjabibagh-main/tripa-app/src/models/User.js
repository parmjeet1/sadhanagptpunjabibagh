import { query } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import tripaEnv from '../config/env.js';

const UserModel = {
  /**
   * Find a user by mobile number.
   */
  findByMobile: async (mobile) => {
    const [rows] = await query(`SELECT * FROM users WHERE mobile = ? LIMIT 1`, [mobile]);
    return rows[0] || null;
  },

  /**
   * Find a user by ID.
   */
  findById: async (id) => {
    const [rows] = await query(
      `SELECT id, name, mobile, role, is_active, created_at, updated_at FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Create a new user.
   */
  create: async ({ name, mobile, password, role = 'driver' }) => {
    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (id, name, mobile, password, role) VALUES (?, ?, ?, ?, ?)`,
      [id, name.trim(), mobile.trim(), hashed, role]
    );
    return UserModel.findById(id);
  },

  /**
   * Verify password against stored hash.
   */
  verifyPassword: async (plain, hashed) => {
    return bcrypt.compare(plain, hashed);
  },

  /**
   * Generate JWT token for a user.
   */
  generateToken: (user) => {
    return jwt.sign(
      { id: user.id, mobile: user.mobile, name: user.name, role: user.role },
      tripaEnv.JWT_SECRET,
      { expiresIn: tripaEnv.JWT_EXPIRES_IN || '7d' }
    );
  },
};

export default UserModel;
