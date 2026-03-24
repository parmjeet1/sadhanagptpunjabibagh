
import { Router } from "express";

import { Register } from "../SadhanaGPT/Controllers/CommonControllers.js";
import { Authorization } from "../middleware/AuthorizationMiddleware.js";
import { addactivity, addSadhna, deleteActivity, detailReport, editActivity, forgetPassword, listActivities, login, logout, studentRegister, todayReportlist, verifyOTP ,Registertest, addTemple, templeList, listCounsellor, updateStudentDetails, onBoarding, userData, UsernotificationList} from "../SadhanaGPT/Student/Controllers/StudentController.js";
import { apiAuthentication, checkCounsellor } from "../middleware/apiAuthenticationMiddleware.js";
import { addCenter, addLable, addNote, addRewardRules, aiReport, assignStudentToCenter, bulkAssignLabel, bulkAssignStudents, centerlist, CustomNotification, deleteCenter, deleteLable, deleteNote, downloadUserReport, editCenter, editLable, editNote, sadhanReportlist, studentActivityDetail, studentlist, studentsadhnalist } from "../SadhanaGPT/Mentors/CounslerController.js";

const router = Router();


const authzAndAuthRoutes = [

             {method: 'post', path: '/on-boarding', handler: onBoarding},
        //  {method: 'post', path: '/register',     handler: Registertest},
        // {method: 'get', path: '/google-call-back', handler: googleLogin},
            {method: 'post',    path: '/login',         handler: login},
            {method: 'get',     path: '/temple-list',   handler: templeList},
            {method: 'post',    path: '/logout',        handler: logout},
             {method: 'get',         path: '/counsellor-list',           handler: listCounsellor ,role: "student"},  
            
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
       
        {method: 'post',        path: '/update-student-profile',    handler: updateStudentDetails ,role: "student"},
        {method: 'post',        path: '/add-counsller',    handler: updateStudentDetails ,role: "student"},
       {method: 'post',        path: '/student-notification-list',    handler: UsernotificationList ,role: "student"},
        //counsellor apis

        {method: 'get', path: '/user-data',                     handler: userData ,role: "student"},
        {method: 'post', path: '/add-acitivity',                handler: addactivity ,role: "student"},
        {method: 'post', path: '/edit-acitivity',               handler: editActivity ,role: "student"},
        {method: 'post', path: '/delete-acitivity',             handler: deleteActivity ,role: "student"},
        {method: 'get', path: '/acitivity-list',                handler: listActivities ,role: "student"},
    
        {method: 'post', path: '/add-daily-report',             handler: addSadhna ,role: "student"},
    
        {method: 'get', path: '/today-report',                  handler: todayReportlist ,role: "student"},
        {method: 'get', path: '/detail-report',                 handler: detailReport ,role: "student"},
        {method: 'post', path: '/forget-password',              handler: forgetPassword ,role: "student"}, 
        {method: 'post', path: '/verify-otp',                   handler: verifyOTP ,role: "student"},
        

        // // counsler routes
        {method: 'post', path: '/add-note', handler: addNote, role: "counsellor"},

        {method: 'put', path: '/edit-note', handler: editNote, role: "counsellor"},     

        {method: 'delete', path: '/delete-note', handler: deleteNote, role: "counsellor"},
        // notification
       {method: 'post',        path: '/counsellor-notification-list',    handler: UsernotificationList ,role: "student"},

    {method: 'post', path: '/cusotm-notification', handler: CustomNotification ,role: "student"},

    {method: 'post',     path: '/add-lable',                  handler: addLable, role: "counsellor"},
    
    {method: 'put',     path: '/edit-lable',                  handler: editLable, role: "counsellor"},
    {method: 'delete',  path: '/delete-lable',                handler: deleteLable,             role: "counsellor"},
    {method: 'post',    path: '/bulk-assign-label',           handler: bulkAssignLabel,         role: "counsellor"},

    {method: 'get',     path: '/student-list',                  handler: studentlist,           role: "counsellor"},

    {method: 'get',     path: '/student-sadhana-list',       handler: studentsadhnalist,        role:"counsellor"},// not completed
    {method: 'get',     path: '/student-sadhana-details',       handler: studentActivityDetail, role: "counsellor"},// not completed
    {method: 'get',     path: '/download-user-report',       handler: downloadUserReport, role: "counsellor"},// not completed
    //rewards apis
    {method: 'post',     path: '/add-rewards-rules',       handler: addRewardRules, role: "counsellor"},// not completed
// avtivtry-list is pending for select box

    
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