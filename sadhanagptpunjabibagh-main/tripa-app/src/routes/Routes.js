import { Router } from "express";
import authController from '../controllers/auth.js';
import driverController from '../controllers/driver.js';
import ridesController from '../controllers/rides.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { 
    registerValidation, 
    loginValidation, 
    createRideValidation, 
    updateRideValidation 
} from '../middleware/allValidation.js';

const router = Router();

// Role Checker Middleware Generator
const checkRole = (allowedRoles) => (req, res, next) => {
    if (!req.user || !req.user.role) {
        return res.status(401).json({ success: false, message: 'Unauthorized: No role found on user.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Access denied: Insufficient role permissions.' });
    }
    next();
};

// ─── Logged-In Routes ─────────────────────────────────────────────────────────
// These automatically require a valid JWT token. 
// You can optionally restrict them further by specifying an array of allowed roles.
const loggedinRoutes = [
    { method: 'get',    path: '/me',         handler: authController.me,         role: ['driver', 'rider'] },
    { method: 'get',    path: '/profile',    handler: driverController.profile,  role: ['driver'] },
    { method: 'get',    path: '/my-rides',   handler: driverController.myRides,  role: ['driver'] }, 
    { method: 'put',    path: '/rides/:id',  handler: ridesController.update,    middlewares: [...updateRideValidation, validate], role: ['driver'] },
    { method: 'delete', path: '/rides/:id',  handler: ridesController.remove,    role: ['driver'] },
];

// ─── Public Routes ────────────────────────────────────────────────────────────
// These are accessible to anyone without a token.
const publicRoutes = [
    { method: 'get',  path: '/test',     handler: (req,res) => { console.log("testing success"); res.send({mesg:"hello succeed"}); } },
    { method: 'post', path: '/register', handler: authController.register, middlewares: [...registerValidation, validate] },
    { method: 'post', path: '/login',    handler: authController.login,    middlewares: [...loginValidation, validate] },
    { method: 'get',  path: '/call-meta/:rideId',  handler: driverController.callMeta },
    { method: 'get',  path: '/rides',           handler: ridesController.list },
    { method: 'get',  path: '/rides/locations', handler: ridesController.getLocations },
    { method: 'post', path: '/rides',           handler: ridesController.create,       middlewares: [optionalAuth, ...createRideValidation, validate] },
    { method: 'post', path: '/rides/:id/call',  handler: ridesController.incrementCallCount },
    
    // IMPORTANT: Parameterized routes must always be mounted last!
    { method: 'get',  path: '/rides/:id',       handler: ridesController.getOne },
];

// 1. Mount Logged-in Routes FIRST (to prevent public catch-all routes from intercepting them)
loggedinRoutes.forEach(({ method, path, handler, role, middlewares = [] }) => {
    const routeMiddlewares = [authenticate, ...middlewares];
    
    // Add RBAC if roles are specified (e.g. ['driver', 'rider'])
    if (role && Array.isArray(role) && role.length > 0) {
        routeMiddlewares.push(checkRole(role));
    }

    router[method](path, ...routeMiddlewares, handler);
});

// 2. Mount Public Routes SECOND
publicRoutes.forEach(({ method, path, handler, middlewares = [] }) => {
    router[method](path, ...middlewares, handler);
});

export default router;