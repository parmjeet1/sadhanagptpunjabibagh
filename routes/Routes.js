
import { Router } from "express";

import { Register } from "../SadhanaGPT/Controllers/CommonControllers.js";
import { Authorization } from "../middleware/AuthorizationMiddleware.js";
import { addactivity, addSadhna, deleteActivity, detailReport, editActivity, forgetPassword, listActivities, login, logout, studentRegister, todayReportlist, verifyOTP ,Registertest, addTemple, templeList, listCounsellor, updateStudentDetails, registerStudentEmailOnly, onBoarding} from "../SadhanaGPT/Student/Controllers/StudentController.js";
import { apiAuthentication, checkCounsellor } from "../middleware/apiAuthenticationMiddleware.js";
import { addCenter, addLable, aiReport, assignStudentToCenter, bulkAssignLabel, bulkAssignStudents, centerlist, deleteCenter, deleteLable, editCenter, editLable, sadhanReportlist, studentlist, studentsadhnalist } from "../SadhanaGPT/Mentors/CounslerController.js";

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
        {method: 'post',        path: '/add-temple',                handler: addTemple ,role: "student"},
        {method: 'get',         path: '/counsellor-list',           handler: listCounsellor ,role: "student"},
        {method: 'post',        path: '/update-student-profile',    handler: updateStudentDetails ,role: "student"},
        {method: 'post',        path: '/add-counsller',    handler: updateStudentDetails ,role: "student"},
    
        //counsellor apis


        

        
        {method: 'post', path: '/add-acitivity', handler: addactivity ,role: "student"},
        {method: 'post', path: '/edit-acitivity', handler: editActivity ,role: "student"},
        {method: 'post', path: '/delete-acitivity', handler: deleteActivity ,role: "student"},
        {method: 'get', path: '/acitivity-list', handler: listActivities ,role: "student"},
    
        {method: 'post', path: '/add-daily-report', handler: addSadhna ,role: "student"},
    
        {method: 'get', path: '/today-report', handler: todayReportlist ,role: "student"},
        {method: 'get', path: '/detail-report', handler: detailReport ,role: "student"},
        {method: 'post', path: '/forget-password', handler: forgetPassword ,role: "student"}, 
        {method: 'post', path: '/verify-otp', handler: verifyOTP ,role: "student"},
        

        // // counsler routes

    {method: 'post',     path: '/add-lable',                  handler: addLable, role: "counsellor"},
    
    {method: 'put',     path: '/edit-lable',                  handler: editLable, role: "counsellor"},
    {method: 'delete',  path: '/delete-lable',                handler: deleteLable, role: "counsellor"},
    {method: 'post',    path: '/bulk-assign-label',           handler: bulkAssignLabel, role: "counsellor"},

    {method: 'get',     path: '/student-list',                  handler: studentlist, role: "counsellor"},

    {method: 'get',     path: '/student-sadhana-list',       handler: studentsadhnalist,role: "counsellor"},// not completed
        {method: 'get',     path: '/student-sadhana-list',       handler: studentsadhnalist,role: "counsellor"},// not completed

    
    {method: 'post',     path: '/ai-report',       handler: aiReport,       role: "counsellor"},// not completed
    
    {method: 'get',     path: '/center-list',                   handler: centerlist, role: "counsellor"},
    {method: 'post',    path: '/add-new-center',                handler: addCenter,role: "counsellor"},
    {method: 'post',    path: '/edit-center',                   handler: editCenter,role: "counsellor"},
    {method: 'delete',  path: '/delete-center',                 handler: deleteCenter,role: "counsellor"},
    {method: 'delete',  path: '/assign-student-to-center',      handler: assignStudentToCenter,role: "counsellor"},
    {method: 'post',     path: '/bulk-assign-student-to-center',handler: bulkAssignStudents,role: "counsellor"},
    {method: 'get', path: '/student-sadhana-report',            handler: sadhanReportlist,role: "counsellor"},// 

        
        // {method: 'get', path: '/chart-details', handler: chartdetail},
        // {method: 'get', path: '/user-activity-details', handler: activitydetail},

        

        //student detail page.      
    ];
    LoggedinRoute.forEach(({ method, path, handler,role }) => {
        const middlewares = [Authorization];  // rateLimit
        middlewares.push(apiAuthentication)
        if (role === "counsellor") {
        middlewares.push(checkCounsellor);
        }
            router[method](path, ...middlewares, handler);
    });
    

export default router;