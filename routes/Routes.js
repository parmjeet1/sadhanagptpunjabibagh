import { Router } from "express";

import { checkPushNotificationStatus, downloadErrorLog, Register, removeSubscription, saveSubscription, sendEmailOtp, updateReminderPreferences, updateFcmToken, verifyEmailOtp } from "../SadhanaGPT/Controllers/CommonControllers.js";
import { Authorization } from "../middleware/AuthorizationMiddleware.js";
import { addactivity, addSadhna, deleteActivity, detailReport, editActivity, forgetPassword, listActivities, login, logout, studentRegister, todayReportlist, verifyOTP, Registertest, addTemple, templeList, listCounsellor, updateStudentDetails, onBoarding, userProfile, UsernotificationList, StudentActivitiesAnalytics, editProfile, uploadProfileImage, removeProfileImage, addCounsellor, removeCounsellor, contentListStudent, verifyCounsellor, submitAppFeedback, getDailyScore, rangeReportColors, getWeeklyRanking, getTopRankerBadge, getStudentAppliedMarkingScheme, whatsappWebhookActivityLog } from "../SadhanaGPT/Student/Controllers/StudentController.js";
import { apiAuthentication, checkCounsellor } from "../middleware/apiAuthenticationMiddleware.js";
import { addCenter, addContent, addLable, addNote, addRewardRules, aiReport, assignStudentToCenter, bulkaiReport, studentAnalysisPreview, generateAIAnalysis, bulkAssignLabel, bulkAssignStudents, centerlist, contentListCounsellor, CustomNotification, deleteCenter, deleteLable, deleteNote, downloadUserReport, editCenter, editLable, editNote, LableList, sadhanReportlist, studentActivityDetail, studentDetails, studentlist, studentNotesList, studentsadhnalist, subCounslorCenterlist, suCounslorList, updateReportSettings, getStudentAiAnalysisHistory, getSingleAiAnalysisReport, aiChatHandler, aiHealthHandler, aiTestHandler, aiDebugAuthHandler, exportBulkStudentReports } from "../SadhanaGPT/Mentors/CounslerController.js";
import { handleFileUpload } from "../utils/fileUpload.js";
import { sendBulknEmails } from "../SadhanaGPT/cronjobs/Email-notificatiion.js";
import { irregularMenteesList, toggleMenteeNotification } from "../SadhanaGPT/Mentors/NotificationController.js";
import { assignActivitiesToStudents, getMentorSelectableActivities, createCustomActivity, assignActivitiesToGroup, deassignActivitiesFromGroup, deleteCustomActivity, deleteAssignedCustomActivity, getGroupSubgroupList } from "../SadhanaGPT/Controllers/custom activities/AssingActvtiesController.js";
import { addMarkingRule, saveMarkingSchemeBatch, getMarkingRules, getSchemesList, createMarkingScheme, getSchemeActivitiesList, deleteMarkingScheme, updateMarkingScheme, deleteMarkingRule, deleteActivityRules } from "../SadhanaGPT/Controllers/Marking Rules/MarkingController.js";
import { getStudentRank } from '../SadhanaGPT/Controllers/SummaryData/showRank.js';
import { getFollowUpStudents } from '../SadhanaGPT/Controllers/SummaryData/followUpStudents.js';


const router = Router();

const authzAndAuthRoutes = [
    { method: 'get', path: '/download-error-log', handler: downloadErrorLog, role: "student" },

    { method: 'post', path: '/send-email-otp', handler: sendEmailOtp, role: "student" },
    { method: 'post', path: '/verify-email-otp', handler: verifyEmailOtp, role: "student" },

    { method: 'get', path: '/send-bulk-email', handler: sendBulknEmails, role: "student" },

    { method: 'post', path: '/on-boarding', handler: onBoarding },
    //  {method: 'post', path: '/register',     handler: Registertest},
    // {method: 'get', path: '/google-call-back', handler: googleLogin},
    { method: 'post', path: '/login', handler: login },
    { method: 'get', path: '/temple-list', handler: templeList },
    { method: 'post', path: '/logout', handler: logout },
    { method: 'get', path: '/counsellor-list', handler: listCounsellor, role: "student" },

    { method: 'post', path: '/verify-counsellor', handler: verifyCounsellor, role: "student" },

    // WhatsApp Webhook API routes (Public / Webhook integration)
    { method: 'post', path: '/whatsapp-webhook', handler: whatsappWebhookActivityLog },
    { method: 'get', path: '/whatsapp-webhook', handler: whatsappWebhookActivityLog },
];
authzAndAuthRoutes.forEach(({ method, path, handler }) => {
    const middlewares = [];

    middlewares.push(Authorization);
    // middlewares.push(apiAuthentication);
    router[method](path, ...middlewares, handler);
});

const LoggedinRoute = [
    // 
    { method: 'get', path: '/check-push-status', handler: checkPushNotificationStatus, role: "student" },

    { method: 'post', path: '/update-reminder-preferences', handler: updateReminderPreferences, role: "student" },
    { method: 'post', path: '/update-fcm-token', handler: updateFcmToken, role: "student" },

    { method: 'post', path: '/notifications-subscribe', handler: saveSubscription, role: "student" },
    { method: 'post', path: '/notifications-unsubscribe', handler: removeSubscription, role: "student" },
    { method: 'post', path: '/app-feedback', handler: submitAppFeedback, role: "student" },

    //studnet apis
    { method: 'post', path: '/add-temple', handler: addTemple, role: "student" },

    { method: 'post', path: '/update-student-profile', handler: updateStudentDetails, role: "student" },
    { method: 'post', path: '/add-counsllor', handler: addCounsellor, role: "student" },
    { method: 'post', path: '/remove-counsllor', handler: removeCounsellor, role: "student" },
    { method: 'post', path: '/remove-counsellor', handler: removeCounsellor, role: "student" },
    { method: 'get', path: '/student-notification-list', handler: UsernotificationList, role: "student" },

    { method: 'get', path: '/user-profile', handler: userProfile, role: "student" },

    { method: 'post', path: '/edit-profile', handler: editProfile, role: "student" },
    { method: 'post', path: '/upload-profile-image', handler: uploadProfileImage, role: "student" },
    { method: 'post', path: '/remove-profile-image', handler: removeProfileImage, role: "student" },

    { method: 'post', path: '/add-acitivity', handler: addactivity, role: "student" },
    { method: 'post', path: '/edit-acitivity', handler: editActivity, role: "student" },
    { method: 'post', path: '/delete-acitivity', handler: deleteActivity, role: "student" },
    { method: 'get', path: '/activity-list', handler: listActivities, role: "student" },

    { method: 'post', path: '/add-daily-report', handler: addSadhna, role: "student" },

    { method: 'post', path: '/report-as-per-date', handler: todayReportlist, role: "student" },
    { method: 'post', path: '/report-colors-range', handler: rangeReportColors, role: "student" },
    { method: 'post', path: '/range-report-colors', handler: rangeReportColors, role: "student" },
    { method: 'get', path: '/daily-score', handler: getDailyScore, role: "student" },
    { method: 'get', path: '/weekly-ranking', handler: getWeeklyRanking, role: "both" },
    { method: 'get', path: '/top-ranker-badge', handler: getTopRankerBadge, role: "student" },
    { method: 'get', path: '/applied-marking-scheme', handler: getStudentAppliedMarkingScheme, role: "student" },
    { method: 'get', path: '/student-activities-analytics', handler: StudentActivitiesAnalytics, role: "student" },

    { method: 'get', path: '/detail-report', handler: detailReport, role: "student" },

    { method: 'post', path: '/forget-password', handler: forgetPassword, role: "student" },
    { method: 'post', path: '/verify-otp', handler: verifyOTP, role: "student" },

    { method: 'get', path: '/student-content-list', handler: contentListStudent, role: "student" },


    // notes 
    { method: 'post', path: '/add-note', handler: addNote, role: "counsellor" },

    { method: 'post', path: '/edit-note', handler: editNote, role: "counsellor" },

    { method: 'post', path: '/delete-note', handler: deleteNote, role: "counsellor" },

    { method: 'get', path: '/student-notes-list', handler: studentNotesList, role: "counsellor" },

    //
    // notification
    { method: 'post', path: '/counsellor-notification-list', handler: UsernotificationList, role: "student" },

    { method: 'post', path: '/cusotm-notification', handler: CustomNotification, role: "student" },
    { method: 'get', path: '/counslor-user-profile', handler: userProfile, role: "counsellor" },

    { method: 'post', path: '/add-lable', handler: addLable, role: "counsellor" },

    { method: 'get', path: '/lable-list', handler: LableList, role: "counsellor" },


    { method: 'post', path: '/edit-lable', handler: editLable, role: "counsellor" },
    { method: 'post', path: '/delete-lable', handler: deleteLable, role: "counsellor" },



    { method: 'get', path: '/student-list', handler: studentlist, role: "counsellor" },

    { method: 'get', path: '/student-details', handler: studentDetails, role: "counsellor" },


    { method: 'get', path: '/student-sadhana-list', handler: studentsadhnalist, role: "counsellor" },// not completed
    { method: 'get', path: '/student-sadhana-details', handler: studentActivityDetail, role: "counsellor" },// not completed
    { method: 'get', path: '/download-user-report', handler: downloadUserReport, role: "counsellor" },// not completed
    //rewards apis
    { method: 'post', path: '/add-rewards-rules', handler: addRewardRules, role: "counsellor" },// not completed
    // avtivtry-list is pending for select box


    { method: 'post', path: '/ai/student-analysis', handler: generateAIAnalysis, role: "both" },
    { method: 'get', path: '/ai/student-analysis/history/:studentId', handler: getStudentAiAnalysisHistory, role: "both" },
    { method: 'get', path: '/ai/student-analysis/report/:reportId', handler: getSingleAiAnalysisReport, role: "both" },
    { method: 'post', path: '/ai/chat', handler: aiChatHandler, role: "both" },
    { method: 'get', path: '/ai/health', handler: aiHealthHandler, role: "both" },
    { method: 'get', path: '/ai/test', handler: aiTestHandler, role: "both" },
    { method: 'get', path: '/ai/debug-auth', handler: aiDebugAuthHandler, role: "both" },
    { method: 'post', path: '/student-analysis-preview', handler: studentAnalysisPreview, role: "both" },
    { method: 'post', path: '/bulk-ai-report', handler: bulkaiReport, role: "counsellor" },// not completed

    { method: 'post', path: '/ai-report', handler: aiReport, role: "counsellor" },// not completed

    { method: 'get', path: '/group-list', handler: centerlist, role: "counsellor" },
    { method: 'post', path: '/add-new-group', handler: addCenter, role: "counsellor" },
    { method: 'post', path: '/edit-center', handler: editCenter, role: "counsellor" },
    { method: 'delete', path: '/delete-center', handler: deleteCenter, role: "counsellor" },

    { method: 'get', path: '/student-sadhana-report', handler: sadhanReportlist, role: "counsellor" },// 
    { method: 'post', path: '/add-new-content', handler: addContent, role: "counsellor" },

    { method: 'get', path: '/sub-counsellor-list', handler: suCounslorList, role: "counsellor" },

    { method: 'get', path: '/group-list-sub-counslor', handler: subCounslorCenterlist, role: "counsellor" },

    { method: 'post', path: '/assign-student-center-label', handler: bulkAssignStudents, role: "counsellor" },

    // {method: 'get', path: '/chart-details', handler: chartdetail},
    // {method: 'get', path: '/user-activity-details', handler: activitydetail},
    { method: 'post', path: '/toggle-email-report', handler: updateReportSettings, role: "counsellor" },
    { method: 'get', path: '/counsellor-content-list', handler: contentListCounsellor, role: "counsellor" },
    ,
    { method: 'post', path: '/toggle-mentee-notification', handler: toggleMenteeNotification, role: "counsellor" },
    { method: 'get', path: '/irregular-mentees', handler: irregularMenteesList, role: "counsellor" },
    ////
    { method: 'get', path: '/selectable-activities-list', handler: getMentorSelectableActivities, role: "counsellor" },

    { method: 'post', path: '/assign-activties-from-mentor', handler: assignActivitiesToStudents , role: "counsellor" },
    { method: 'post', path: '/assign-group-activities', handler: assignActivitiesToGroup, role: "counsellor" },
    { method: 'post', path: '/deassign-group-activities', handler: deassignActivitiesFromGroup, role: "counsellor" },
    { method: 'post', path: '/create-custom-activity', handler: createCustomActivity, role: "counsellor" },
    { method: 'post', path: '/delete-custom-activity', handler: deleteCustomActivity, role: "counsellor" },
    { method: 'post', path: '/delete-assigned-custom-activity', handler: deleteAssignedCustomActivity, role: "counsellor" },
    { method: 'get', path: '/group-subgroup-list', handler: getGroupSubgroupList, role: "counsellor" },
    { method: 'post', path: '/add-marking-rule', handler: addMarkingRule, role: "counsellor" },
    { method: 'post', path: '/save-marking-scheme', handler: saveMarkingSchemeBatch , role: "counsellor" },
    { method: 'post', path: '/marking-rules', handler: getMarkingRules , role: "counsellor" },
    { method: 'post', path: '/scheme-list', handler: getSchemesList , role: "counsellor" },
    { method: 'post', path: '/create-marking-scheme', handler: createMarkingScheme, role: "counsellor" },
    { method: 'post', path: '/scheme-activities-list', handler: getSchemeActivitiesList, role: "counsellor" },
    { method: 'post', path: '/delete-marking-scheme', handler: deleteMarkingScheme, role: "counsellor" },
    { method: 'post', path: '/update-marking-scheme', handler: updateMarkingScheme, role: "counsellor" },
    { method: 'post', path: '/delete-marking-rule', handler: deleteMarkingRule, role: "counsellor" },
    { method: 'post', path: '/delete-activity-rules', handler: deleteActivityRules, role: "counsellor" },
    { method: 'get', path: '/student-rank', handler: getStudentRank, role: "counsellor" },
    { method: 'get', path: '/student-followup', handler: getFollowUpStudents, role: "counsellor" },
    { method: 'post', path: '/create-custom-activity', handler: createCustomActivity }

        


    //student detail page.      
];

const uploadRules = {
    // 
    '/add-new-content': { folder: 'content', fields: ['image'], maxCount: 1, condition: (req) => req.body?.content_type === 'image' },
    '/upload-profile-image': { folder: 'profile', fields: ['profile'], maxCount: 1 },
}
LoggedinRoute.forEach(({ method, path, handler, role }) => {
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