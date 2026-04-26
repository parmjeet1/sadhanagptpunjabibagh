
import { Router } from "express";

import { Register, sendEmailOtp, verifyEmailOtp } from "../SadhanaGPT/Controllers/CommonControllers.js";
import { Authorization } from "../middleware/AuthorizationMiddleware.js";
import { addactivity, addSadhna, deleteActivity, detailReport, editActivity, forgetPassword, listActivities, login, logout, studentRegister, todayReportlist, verifyOTP ,Registertest, addTemple, templeList, listCounsellor, updateStudentDetails, onBoarding, userProfile, UsernotificationList, StudentActivitiesAnalytics, editProfile, addCounsellor, contentListStudent, downloadErrorLog, verifyCounsellor, submitAppFeedback} from "../SadhanaGPT/Student/Controllers/StudentController.js";
import { apiAuthentication, checkCounsellor } from "../middleware/apiAuthenticationMiddleware.js";
import { addCenter, addContent, addLable, addNote, addRewardRules, aiReport, assignStudentToCenter, bulkaiReport, bulkAssignLabel, bulkAssignStudents, centerlist, contentListCounsellor, CustomNotification, deleteCenter, deleteLable, deleteNote, downloadUserReport, editCenter, editLable, editNote, LableList, sadhanReportlist, studentActivityDetail, studentDetails, studentlist, studentsadhnalist, subCounslorCenterlist, suCounslorList, updateReportSettings } from "../SadhanaGPT/Mentors/CounslerController.js";
import { handleFileUpload } from "../utils/fileUpload.js";
import { sendBulknEmails } from "../SadhanaGPT/cronjobs/Email-notificatiion.js";

const router = Router();


const authzAndAuthRoutes = [
    
       {method: 'post',        path: '/send-email-otp',    handler: sendEmailOtp ,role: "student"},
       {method: 'post',        path: '/verify-email-otp',    handler: verifyEmailOtp ,role: "student"},

       {method: 'get',        path: '/send-bulk-email',    handler: sendBulknEmails ,role: "student"},


             {method: 'post', path: '/logs', handler: downloadErrorLog},
            
    {method: 'post', path: '/on-boarding', handler: onBoarding},
        //  {method: 'post', path: '/register',     handler: Registertest},
        // {method: 'get', path: '/google-call-back', handler: googleLogin},
            {method: 'post',    path: '/login',         handler: login},
            {method: 'get',     path: '/temple-list',   handler: templeList},
            {method: 'post',    path: '/logout',        handler: logout},
             {method: 'get',         path: '/counsellor-list',           handler: listCounsellor ,role: "student"},  
            
             {method: 'post',         path: '/verify-counsellor',           handler: verifyCounsellor ,role: "student"},  

];
    authzAndAuthRoutes.forEach(({ method, path, handler }) => {
    const middlewares = [];
 
    middlewares.push(Authorization);
    // middlewares.push(apiAuthentication);
    router[method](path, ...middlewares, handler);
    });

    const LoggedinRoute = [
        //
        
        {method: 'post',        path: '/app-feedback',                handler: submitAppFeedback ,role: "student"},

        //studnet apis
        {method: 'post',        path: '/add-temple',                handler: addTemple ,role: "student"},
       
        {method: 'post',        path: '/update-student-profile',    handler: updateStudentDetails ,role: "student"},
        {method: 'post',        path: '/add-counsllor',    handler: addCounsellor ,role: "student"},
       {method: 'get',        path: '/student-notification-list',    handler: UsernotificationList ,role: "student"},
        
        {method: 'get', path: '/user-profile',                     handler: userProfile ,role: "student"},
        
        {method: 'post', path: '/edit-profile',                     handler: editProfile ,role: "student"},
        
        {method: 'post', path: '/add-acitivity',                handler: addactivity ,role: "student"},
        {method: 'post', path: '/edit-acitivity',               handler: editActivity ,role: "student"},
        {method: 'post', path: '/delete-acitivity',             handler: deleteActivity ,role: "student"},
        {method: 'get', path: '/activity-list',                handler: listActivities ,role: "student"},
        
    
        {method: 'post', path: '/add-daily-report',             handler: addSadhna ,role: "student"},
    
        {method: 'post', path: '/report-as-per-date',                  handler: todayReportlist ,role: "student"},
        {method: 'get', path: '/student-activities-analytics',                 handler: StudentActivitiesAnalytics ,role: "student"},
        
        {method: 'get', path: '/detail-report',                 handler: detailReport ,role: "student"},
     
        {method: 'post', path: '/forget-password',              handler: forgetPassword ,role: "student"}, 
        {method: 'post', path: '/verify-otp',                   handler: verifyOTP ,role: "student"},
     
        {method: 'get', path: '/student-content-list',                 handler: contentListStudent ,role: "student"},


        // // counsler routes
        {method: 'post', path: '/add-note', handler: addNote, role: "counsellor"},

        {method: 'put', path: '/edit-note', handler: editNote, role: "counsellor"},     

        {method: 'delete', path: '/delete-note', handler: deleteNote, role: "counsellor"},
        // notification
       {method: 'post',        path: '/counsellor-notification-list',    handler: UsernotificationList ,role: "student"},

    {method: 'post', path: '/cusotm-notification', handler: CustomNotification ,role: "student"},
        {method: 'get', path: '/counslor-user-profile',                     handler: userProfile ,role: "counsellor"},

    {method: 'post',     path: '/add-lable',                  handler: addLable, role: "counsellor"},
    
    {method: 'get',     path: '/lable-list',                  handler: LableList, role: "counsellor"},

    
    {method: 'post',     path: '/edit-lable',                  handler: editLable, role: "counsellor"},
    {method: 'post',  path: '/delete-lable',                handler: deleteLable,             role: "counsellor"},
    
    

    {method: 'get',     path: '/student-list',                  handler: studentlist,           role: "counsellor"},

    {method: 'get',     path: '/student-details',                  handler: studentDetails,           role: "counsellor"},


    {method: 'get',     path: '/student-sadhana-list',       handler: studentsadhnalist,        role:"counsellor"},// not completed
    {method: 'get',     path: '/student-sadhana-details',       handler: studentActivityDetail, role: "counsellor"},// not completed
    {method: 'get',     path: '/download-user-report',       handler: downloadUserReport, role: "counsellor"},// not completed
    //rewards apis
    {method: 'post',     path: '/add-rewards-rules',       handler: addRewardRules, role: "counsellor"},// not completed
// avtivtry-list is pending for select box

    
    {method: 'post',     path: '/bulk-ai-report',       handler: bulkaiReport,       role: "counsellor"},// not completed

    {method: 'post',     path: '/ai-report',       handler: aiReport,       role: "counsellor"},// not completed
    
    {method: 'get',     path: '/group-list',                   handler: centerlist, role: "counsellor"},
    {method: 'post',    path: '/add-new-group',                handler: addCenter,role: "counsellor"},
    {method: 'post',    path: '/edit-center',                   handler: editCenter,role: "counsellor"},
    {method: 'delete',  path: '/delete-center',                 handler: deleteCenter,role: "counsellor"},

    {method: 'get', path: '/student-sadhana-report',            handler: sadhanReportlist,role: "counsellor"},// 
    {method: 'post',    path: '/add-new-content',                handler: addContent,role: "counsellor"},

    {method: 'get',     path: '/sub-counsellor-list',                  handler: suCounslorList,           role: "counsellor"},

    {method: 'get',    path: '/group-list-sub-counslor',                handler: subCounslorCenterlist,role: "counsellor"},
   
    {method: 'post',     path: '/assign-student-center-label',handler: bulkAssignStudents,role: "counsellor"},
        
        // {method: 'get', path: '/chart-details', handler: chartdetail},
        // {method: 'get', path: '/user-activity-details', handler: activitydetail},
    {method: 'post',     path: '/toggle-email-report',handler: updateReportSettings,role: "counsellor"},
    { method: 'get', path: '/counsellor-content-list', handler: contentListCounsellor, role: "counsellor" },


        

        //student detail page.      
    ];

    const uploadRules = {
    // 
        '/add-new-content' : { folder: 'content',    fields: ['image'], maxCount:1,condition: (req) => req.body?.content_type === 'image' },
    }
    LoggedinRoute.forEach(({ method, path, handler,role }) => {
        const middlewares = [Authorization];  // rateLimit
        middlewares.push(apiAuthentication)
        if (role === "counsellor") {
        middlewares.push(checkCounsellor);
        }
         const rule = uploadRules[path];
if (rule) {
    // Add the [] before rule.maxCount
    middlewares.push(handleFileUpload(rule.folder, rule.fields, [], rule.maxCount));
}
        
            router[method](path, ...middlewares, handler);
    });
    

export default router;