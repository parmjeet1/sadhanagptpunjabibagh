import { query } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Map a DB row to a clean Ride DTO object.
 */
const mapRow = (row) => ({
  id: row.id,
  driverName: row.driver_name,
  phoneNumber: row.phone_number,
  vehicleNumber: row.vehicle_number,
  vehicleName: row.vehicle_name,
  fromLocation: row.from_location,
  fromLat: row.from_lat ? parseFloat(row.from_lat) : null,
  fromLng: row.from_lng ? parseFloat(row.from_lng) : null,
  toLocation: row.to_location,
  toLat: row.to_lat ? parseFloat(row.to_lat) : null,
  toLng: row.to_lng ? parseFloat(row.to_lng) : null,
  travelDate: row.travel_date instanceof Date
    ? row.travel_date.toISOString().split('T')[0]
    : row.travel_date,
  travelTime: row.travel_time,
  bookingFrequency: row.booking_frequency,
  weekdays: row.weekdays || null,
  specificDate: row.specific_date
    ? (row.specific_date instanceof Date
        ? row.specific_date.toISOString().split('T')[0]
        : row.specific_date)
    : null,
  price: row.price ? parseFloat(row.price) : null,
  priceMode: row.price_mode,
  maxLuggage: row.max_luggage,
  rideType: row.ride_type || 'sharing',
  status: row.status,
  userId: row.user_id,
  callCount: row.call_count || 0,
  allowReverse: row.allow_reverse ? true : false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const RideModel = {
  /**
   * Create a new ride.
   */
  create: async (data) => {
    const id = uuidv4();
    await query(
      `INSERT INTO rides
        (id, user_id, vehicle_id, driver_name, phone_number, vehicle_number, vehicle_name,
         from_location, from_lat, from_lng, to_location, to_lat, to_lng, travel_date, travel_time,
         booking_frequency, weekdays, specific_date,
         price, price_mode, max_luggage, ride_type, allow_reverse, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        id,
        data.userId,
        data.vehicleId || null,
        data.driverName,
        data.phoneNumber,
        data.vehicleNumber || null,
        data.vehicleName || null,
        data.fromLocation,
        data.fromLat || null,
        data.fromLng || null,
        data.toLocation,
        data.toLat || null,
        data.toLng || null,
        data.travelDate,
        data.travelTime || '00:00:00',
        data.bookingFrequency,
        data.weekdays ? JSON.stringify(data.weekdays) : null,
        data.specificDate || null,
        data.price || null,
        data.priceMode || 'fixed',
        data.maxLuggage || 'medium',
        data.rideType || 'sharing',
        data.allowReverse !== false ? 1 : 0,
      ]
    );
    const [rows] = await query(`SELECT * FROM rides WHERE id = ? LIMIT 1`, [id]);
    return mapRow(rows[0]);
  },

  /**
   * Update an existing ride (only by owner).
   */
  update: async (id, userId, data) => {
    const fields = [];
    const values = [];

    const allowedFields = {
      driver_name: data.driverName,
      phone_number: data.phoneNumber,
      vehicle_number: data.vehicleNumber,
      vehicle_name: data.vehicleName,
      from_location: data.fromLocation,
      from_lat: data.fromLat,
      from_lng: data.fromLng,
      to_location: data.toLocation,
      to_lat: data.toLat,
      to_lng: data.toLng,
      travel_date: data.travelDate,
      travel_time: data.travelTime,
      booking_frequency: data.bookingFrequency,
      weekdays: data.weekdays ? JSON.stringify(data.weekdays) : undefined,
      specific_date: data.specificDate,
      price: data.price,
      price_mode: data.priceMode,
      max_luggage: data.maxLuggage,
      ride_type: data.rideType,
      allow_reverse: data.allowReverse !== undefined ? (data.allowReverse ? 1 : 0) : undefined,
      status: data.status,
    };

    for (const [col, val] of Object.entries(allowedFields)) {
      if (val !== undefined) {
        fields.push(`${col} = ?`);
        values.push(val);
      }
    }

    if (fields.length === 0) return RideModel.findById(id);

    values.push(id, userId);
    await query(
      `UPDATE rides SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    return RideModel.findById(id);
  },

  /**
   * Delete a ride (only by owner).
   */
  delete: async (id, userId) => {
    const [result] = await query(
      `DELETE FROM rides WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return result.affectedRows > 0;
  },

  /**
   * Find ride by ID.
   */
  findById: async (id) => {
    const [rows] = await query(`SELECT * FROM rides WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  /**
   * Search active rides with optional filters and pagination.
   */
  search: async ({ fromLocation, toLocation, travelDate, userLat, userLng, rideType, page = 1, limit = 20 }) => {
    const conditions = [`status = 'active'`];
    const params = [];

    if (rideType && ['sharing', 'personal'].includes(rideType)) {
      conditions.push(`ride_type = ?`);
      params.push(rideType);
    }

    // Only apply the 100km GPS filter if the user hasn't explicitly typed a location search.
    // If they typed a location, allow them to search anywhere in the world.
    if (!fromLocation && !toLocation && userLat !== undefined && userLng !== undefined && !Number.isNaN(userLat) && !Number.isNaN(userLng)) {
      conditions.push(`
        (
          (from_lat IS NULL AND to_lat IS NULL)
          OR
          (from_lat IS NOT NULL AND from_lng IS NOT NULL AND (6371 * acos(cos(radians(?)) * cos(radians(from_lat)) * cos(radians(from_lng) - radians(?)) + sin(radians(?)) * sin(radians(from_lat)))) <= 100)
          OR
          (to_lat IS NOT NULL AND to_lng IS NOT NULL AND (6371 * acos(cos(radians(?)) * cos(radians(to_lat)) * cos(radians(to_lng) - radians(?)) + sin(radians(?)) * sin(radians(to_lat)))) <= 100)
        )
      `);
      params.push(userLat, userLng, userLat, userLat, userLng, userLat);
    }

    if (fromLocation && fromLocation.trim() && toLocation && toLocation.trim()) {
      conditions.push(`(
        (from_location LIKE ? AND to_location LIKE ?)
        OR
        (from_location LIKE ? AND to_location LIKE ? AND allow_reverse = 1)
      )`);
      params.push(`%${fromLocation.trim()}%`, `%${toLocation.trim()}%`, `%${toLocation.trim()}%`, `%${fromLocation.trim()}%`);
    } else {
      if (fromLocation && fromLocation.trim()) {
        conditions.push(`(from_location LIKE ? OR (to_location LIKE ? AND allow_reverse = 1))`);
        params.push(`%${fromLocation.trim()}%`, `%${fromLocation.trim()}%`);
      }
      if (toLocation && toLocation.trim()) {
        conditions.push(`(to_location LIKE ? OR (from_location LIKE ? AND allow_reverse = 1))`);
        params.push(`%${toLocation.trim()}%`, `%${toLocation.trim()}%`);
      }
    }

    // Smart date-aware availability filter
    if (travelDate) {
      // User searched for a specific date — figure out which day of week that is
      // and return rides matching that date or recurring on that weekday
      const searchDate = new Date(travelDate);
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const dayName = dayNames[searchDate.getDay()];

      conditions.push(`(
        (booking_frequency = 'every_day')
        OR (booking_frequency = 'today_only' AND travel_date = ?)
        OR (booking_frequency = 'specific_date' AND travel_date = ?)
        OR (booking_frequency = 'week_days' AND JSON_CONTAINS(weekdays, JSON_QUOTE(?)))
      )`);
      params.push(travelDate, travelDate, dayName);
    } else {
      // No date filter — show rides available TODAY and upcoming
      conditions.push(`(
        (booking_frequency = 'every_day')
        OR (booking_frequency = 'today_only' AND travel_date >= CURDATE())
        OR (booking_frequency = 'specific_date' AND travel_date >= CURDATE())
        OR (booking_frequency = 'week_days' AND JSON_CONTAINS(weekdays, JSON_QUOTE(LOWER(LEFT(DAYNAME(CURDATE()), 3)))))
      )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [countRows] = await query(`SELECT COUNT(*) AS total FROM rides ${where}`, params);
    const total = countRows[0].total;

    params.push(parseInt(limit), offset);
    console.log(`SELECT * FROM rides ${where} ORDER BY travel_date ASC, travel_time ASC LIMIT ? OFFSET ?`,'param ', params);
    const [rows] = await query(
      `SELECT * FROM rides ${where} ORDER BY travel_date ASC, travel_time ASC LIMIT ? OFFSET ?`,
      params
    );

    return {
      rides: rows.map(mapRow),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    };
  },

  /**
   * Get all rides for a specific driver.
   */
  findByUserId: async (userId, page = 1, limit = 20) => {
    console.log("test working")
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [countRows] = await query(
      `SELECT COUNT(*) AS total FROM rides WHERE user_id = ?`,
      [userId]
    );
    const total = countRows[0].total;

    const [rows] = await query(
      `SELECT * FROM rides WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), offset]
    );

    return {
      rides: rows.map(mapRow),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    };
  },

  /**
   * Get unique locations from active rides to use as suggestions.
   */
  getUniqueLocations: async (queryStr) => {
    let whereFrom = "status = 'active'";
    let whereTo = "status = 'active'";
    const paramsFrom = [];
    const paramsTo = [];

    if (queryStr && queryStr.trim()) {
      whereFrom += " AND from_location LIKE ?";
      paramsFrom.push(`%${queryStr.trim()}%`);
      
      whereTo += " AND to_location LIKE ?";
      paramsTo.push(`%${queryStr.trim()}%`);
    }

    const [rows] = await query(`
      SELECT from_location AS name FROM rides WHERE ${whereFrom}
      UNION
      SELECT to_location AS name FROM rides WHERE ${whereTo}
    `, [...paramsFrom, ...paramsTo]);
    return rows.map(r => r.name);
  },

  /**
   * Increment driver call button click counter.
   */
  incrementCallCount: async (id) => {
    const [result] = await query(
      `UPDATE rides SET call_count = call_count + 1 WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  },
};

export default RideModel;
