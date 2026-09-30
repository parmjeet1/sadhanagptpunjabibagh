import RideModel from '../models/Ride.js';
import VehicleModel from '../models/Vehicle.js';
import UserModel from '../models/User.js';
import { getCoordinates } from '../utils/geocoder.js';
import moment from 'moment';

const ridesController = {
  /**
   * GET /api/rides
   * Search/list active rides with optional filters and pagination.
   * Query params: fromLocation, toLocation, travelDate, page, limit
   */
  list: async (req, res, next) => {
    try {
      const { fromLocation, toLocation, travelDate, userLat, userLng, rideType, page = 1, limit = 20 } = req.query;
      console.log("req.query",req.query)

      const result = await RideModel.search({ 
        fromLocation, 
        toLocation, 
        travelDate, 
        userLat: userLat ? parseFloat(userLat) : undefined,
        userLng: userLng ? parseFloat(userLng) : undefined,
        rideType,
        page, 
        limit 
      });

      res.json({
        success: true,
        data: result.rides,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/rides/locations
   * Get unique locations for autocomplete suggestions.
   */
  getLocations: async (req, res, next) => {
    try {
      const { q } = req.query;
      const locations = await RideModel.getUniqueLocations(q);
      res.json({ success: true, data: locations });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/rides/:id
   * Get a single ride by ID.
   */
  getOne: async (req, res, next) => {
    try {
      const ride = await RideModel.findById(req.params.id);
      if (!ride) {
        return res.status(404).json({ success: false, message: 'Ride not found.' });
      }
      res.json({ success: true, data: ride });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/rides
   * Create a new ride. If no token provided, auto-registers the driver.
   */
  create: async (req, res, next) => {
    try {
      const {
        driverName,
        phoneNumber,
        vehicleNumber,
        vehicleName,
        fromLocation,
        toLocation,
        travelDate,
        travelTime,
        bookingFrequency,
        weekdays,
        specificDate,
        price,
        priceMode,
        maxLuggage,
        rideType,
        allowReverse,
      } = req.body;

      // Resolve user: use authenticated user or auto-register
      let userId;
      if (req.user && req.user.id) {
        userId = req.user.id;
      } else {
        // Auto-register: find by mobile or create new user
        const mobile = (phoneNumber || '').trim();
        const name = (driverName || 'Driver').trim();
        let existingUser = await UserModel.findByMobile(mobile);
        if (existingUser) {
          userId = existingUser.id;
        } else {
          // Create with a default password (driver can reset later)
          const newUser = await UserModel.create({
            name,
            mobile,
            password: mobile.slice(-6) || '123456',
            role: 'driver',
          });
          userId = newUser.id;
        }
      }

      // Find or create vehicle record if vehicleNumber is provided
      let vehicleId = null;
      if (vehicleNumber && vehicleNumber.trim()) {
        const vehicle = await VehicleModel.findOrCreate(userId, vehicleNumber);
        vehicleId = vehicle.id;
      }

      // Geocode locations (fails gracefully to null if API error or missing API key)
      const fromCoords = await getCoordinates(fromLocation.trim());
      const toCoords = await getCoordinates(toLocation.trim());

      const ride = await RideModel.create({
        userId,
        vehicleId,
        driverName: driverName || (req.user ? req.user.name : 'Driver'),
        phoneNumber: phoneNumber || (req.user ? req.user.mobile : ''),
        vehicleNumber: vehicleNumber && vehicleNumber.trim() ? vehicleNumber.trim().toUpperCase() : null,
        vehicleName: vehicleName && vehicleName.trim() ? vehicleName.trim() : null,
        fromLocation: fromLocation.trim(),
        fromLat: fromCoords ? fromCoords.lat : null,
        fromLng: fromCoords ? fromCoords.lng : null,
        toLocation: toLocation.trim(),
        toLat: toCoords ? toCoords.lat : null,
        toLng: toCoords ? toCoords.lng : null,
        travelDate,
        travelTime: travelTime || '00:00:00',
        bookingFrequency: bookingFrequency || 'today_only',
        weekdays: weekdays || null,
        specificDate: specificDate || null,
        price: price ? parseFloat(price) : null,
        priceMode: priceMode || 'fixed',
        maxLuggage: maxLuggage || 'medium',
        rideType: rideType || 'sharing',
        allowReverse: allowReverse !== undefined ? (allowReverse === 'true' || allowReverse === true) : true,
      });

      res.status(201).json({
        success: true,
        message: 'Ride published successfully',
        data: ride,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/rides/:id
   * Update a ride (owner only). Requires JWT authentication.
   */
  update: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verify ownership
      const existing = await RideModel.findById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Ride not found.' });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ success: false, message: 'Access denied. You can only edit your own rides.' });
      }

      // Geocode locations if they are being updated
      if (req.body.fromLocation) {
        const fromCoords = await getCoordinates(req.body.fromLocation.trim());
        if (fromCoords) {
          req.body.fromLat = fromCoords.lat;
          req.body.fromLng = fromCoords.lng;
        }
      }
      if (req.body.toLocation) {
        const toCoords = await getCoordinates(req.body.toLocation.trim());
        if (toCoords) {
          req.body.toLat = toCoords.lat;
          req.body.toLng = toCoords.lng;
        }
      }

      const ride = await RideModel.update(id, userId, req.body);
      res.json({ success: true, message: 'Ride updated successfully', data: ride });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/rides/:id
   * Delete a ride (owner only). Requires JWT authentication.
   */
  remove: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const existing = await RideModel.findById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Ride not found.' });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ success: false, message: 'Access denied. You can only delete your own rides.' });
      }

      const deleted = await RideModel.delete(id, userId);
      if (!deleted) {
        return res.status(500).json({ success: false, message: 'Failed to delete ride.' });
      }

      res.json({ success: true, message: 'Ride deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/rides/:id/call
   * Increment call_count counter for a ride.
   */
  incrementCallCount: async (req, res, next) => {
    try {
      const { id } = req.params;
      const success = await RideModel.incrementCallCount(id);
      if (!success) {
        return res.status(404).json({ success: false, message: 'Ride not found.' });
      }
      res.json({ success: true, message: 'Call count incremented successfully' });
    } catch (error) {
      next(error);
    }
  },
};

export default ridesController;
