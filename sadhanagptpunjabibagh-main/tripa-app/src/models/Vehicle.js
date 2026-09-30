import { query } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

const VehicleModel = {
  /**
   * Find or create a vehicle for a user.
   */
  findOrCreate: async (userId, vehicleNumber) => {
    const cleanNumber = vehicleNumber.trim().toUpperCase();
    const [rows] = await query(
      `SELECT * FROM vehicles WHERE user_id = ? AND vehicle_number = ? LIMIT 1`,
      [userId, cleanNumber]
    );
    if (rows[0]) return rows[0];

    const id = uuidv4();
    await query(
      `INSERT INTO vehicles (id, user_id, vehicle_number) VALUES (?, ?, ?)`,
      [id, userId, cleanNumber]
    );
    const [newRows] = await query(`SELECT * FROM vehicles WHERE id = ? LIMIT 1`, [id]);
    return newRows[0];
  },

  /**
   * Get all vehicles for a user.
   */
  findByUserId: async (userId) => {
    const [rows] = await query(
      `SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  },
};

export default VehicleModel;
