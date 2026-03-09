
import { Router } from "express";

import { Register } from "../SadhanaGPT/Controllers/CommonControllers.js";
import { Authorization } from "../middleware/AuthorizationMiddleware.js";
import { addactivity, addSadhna, deleteActivity, detailReport, editActivity, forgetPassword, listActivities, login, logout, studentRegister, todayReportlist, verifyOTP ,Registertest, addTemple, templeList, listCounsellor, updateStudentDetails, registerStudentEmailOnly, onBoarding} from "../SadhanaGPT/Student/Controllers/StudentController.js";
import { apiAuthentication } from "../middleware/apiAuthenticationMiddleware.js";
import { sadhanReportlist, studentlist } from "../SadhanaGPT/Mentors/CounslerController.js";

const router = Router();


const authzAndAuthRoutes = [
 {method: 'post', path: '/register', handler: registerStudentEmailOnly},
 {method: 'post', path: '/on-boarding', handler: onBoarding},

 //
//  {method: 'post', path: '/register', handler: Registertest},

    
    // {method: 'get', path: '/google-call-back', handler: googleLogin},
    
        {method: 'post',    path: '/login',         handler: login},
        {method: 'get',     path: '/temple-list',   handler: templeList},
        {method: 'post',    path: '/logout',        handler: logout},  
            
];
    authzAndAuthRoutes.forEach(({ method, path, handler }) => {
    const middlewares = [];
 
    middlewares.push(Authorization);
    // middlewares.push(apiAuthentication);
    router[method](path, ...middlewares, handler);
    });

    const LoggedinRoute = [
        
        //studnet apis
        {method: 'post',        path: '/add-temple',                handler: addTemple},
        {method: 'get',         path: '/counsellor-list',           handler: listCounsellor},
        {method: 'post',        path: '/update-student-profile',    handler: updateStudentDetails},
        //counsellor apis


        

        
        {method: 'post', path: '/add-acitivity', handler: addactivity},
        {method: 'post', path: '/edit-acitivity', handler: editActivity},
        {method: 'post', path: '/delete-acitivity', handler: deleteActivity},
        {method: 'get', path: '/acitivity-list', handler: listActivities},
    
        {method: 'post', path: '/add-daily-report', handler: addSadhna},
    
        {method: 'get', path: '/today-report', handler: todayReportlist},
        {method: 'get', path: '/detail-report', handler: detailReport},
        {method: 'post', path: '/forget-password', handler: forgetPassword}, 
        {method: 'post', path: '/verify-otp', handler: verifyOTP},
        

        // // counsler routes
        {method: 'get', path: '/student-list', handler: studentlist},
        {method: 'get', path: '/student-sadhana-report', handler: sadhanReportlist},

        
        // {method: 'get', path: '/chart-details', handler: chartdetail},
        // {method: 'get', path: '/user-activity-details', handler: activitydetail},

        

        //student detail page.      
    ];
    LoggedinRoute.forEach(({ method, path, handler }) => {
        const middlewares = [Authorization];  // rateLimit
        middlewares.push(apiAuthentication)
            router[method](path, ...middlewares, handler);
    });
    

export default router;