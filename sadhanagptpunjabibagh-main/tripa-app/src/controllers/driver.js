import RideModel from '../models/Ride.js';
import UserModel from '../models/User.js';

const driverController = {
  /**
   * GET /api/driver/rides
   * Get all rides published by the authenticated driver (paginated).
   */
  myRides: async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await RideModel.findByUserId(req.user.id, page, limit);

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
   * GET /api/driver/call-meta/:rideId
   * Returns metadata needed to initiate a call to a driver.
   * This is a public endpoint — no auth required.
   */
  callMeta: async (req, res, next) => {
    try {
      const ride = await RideModel.findById(req.params.rideId);
      if (!ride) {
        return res.status(404).json({ success: false, message: 'Ride not found.' });
      }

      res.json({
        success: true,
        data: {
          rideId: ride.id,
          driverName: ride.driverName,
          phoneNumber: ride.phoneNumber,
          vehicleNumber: ride.vehicleNumber,
          fromLocation: ride.fromLocation,
          toLocation: ride.toLocation,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/driver/profile
   * Get the authenticated driver's full profile + ride stats.
   */
  profile: async (req, res, next) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      const result = await RideModel.findByUserId(req.user.id, 1, 1000);
      const rides = result.rides;
      const stats = {
        total: rides.length,
        active: rides.filter(r => r.status === 'active').length,
        completed: rides.filter(r => r.status === 'completed').length,
      };

      res.json({
        success: true,
        data: { user, stats },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default driverController;
