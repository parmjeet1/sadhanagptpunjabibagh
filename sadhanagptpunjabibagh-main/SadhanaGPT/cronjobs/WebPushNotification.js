import axios from 'axios';
import db from '../../config/database.js'
import webpush from 'web-push';
import dotenv from 'dotenv';
import cron from "node-cron";
webpush.setVapidDetails(
  'mailto:your-email@example.com', // Must be a valid email or URL
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);


export const sendSadhanaPushReminders = async () => {
  try {
    console.log("Starting Saturday Sadhana WEB PUSH reminders...");
    // Fetch only students who actually have a push subscription linked
    const [students] = await db.execute(`
            SELECT 
                u.name AS student_name,
                c.name AS mentor_name,
                ps.endpoint,
                ps.p256dh,
                ps.auth
            FROM user_counsellors uc
            JOIN users u ON uc.user_id = u.user_id
            JOIN users c ON uc.counsller_id = c.user_id
            JOIN push_subscriptions ps ON u.user_id = ps.user_id
           `);
    console.log("students", students);
    // WHERE c.auto_report_status = 1
    if (students.length === 0) {
      console.log("No students with push subscriptions found. Skipping.");
      return;
    }
    for (const student of students) {
      const studentName = student.student_name || "Student";
      const mentorName = student.mentor_name || "your Mentor";


      // Format the message
      const message = `Hare Krishna ${studentName}, kindly fill your sadhna for the last week in SadhnaGPT App because tomorrow the weekly report will be sent to your mentor ${mentorName}.`;
      // Prepare the subscription object required by web-push
      const pushSubscription = {
        endpoint: student.endpoint,
        keys: {
          p256dh: student.p256dh,
          auth: student.auth
        }
      };
      // The payload must be a stringified JSON
      const pushPayload = JSON.stringify({
        title: 'Sadhana Reminder',
        body: message
      });
      try {
        // Send the push notification
        await webpush.sendNotification(pushSubscription, pushPayload);
        // console.log(`✅ Push sent to ${studentName}`);
      } catch (pushErr) {
        // If statusCode is 410, it means the user manually blocked notifications or the subscription expired
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          console.log(`Subscription expired/revoked for ${studentName}. Removing from DB.`);
          await db.execute(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [student.endpoint]);
        } else {
          console.error(` Push Failed for ${studentName}:`, pushErr.message);
        }
      }
      // Small delay to prevent rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    console.log("✅ All Web Push reminders processed.");
  } catch (error) {
    console.error("Critical error in sendSadhanaPushReminders:", error);
  }
};
// cron/advancedInactivityReminders.js

// IMPORT YOUR DATABASE WRAPPER HERE
// const db = require('../config/db'); 

/**
 * Helper to convert "7:00 AM" or "07:00 AM" to minutes from midnight
 */
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [time, modifier] = timeStr.trim().split(' ');
  let [hours, minutes] = time.split(':');

  if (hours === '12') hours = '0';
  if (modifier?.toUpperCase() === 'PM') hours = parseInt(hours, 10) + 12;

  return (parseInt(hours, 10) * 60) + parseInt(minutes || 0, 10);
};

/**
 * Helper to get user's push subscription from database
 */
const getUserPushSubscription = async (user_id) => {
  try {
    // Select the specific columns from your table
    const query = `
      SELECT endpoint, p256dh, auth 
      FROM push_subscriptions 
      WHERE user_id = ? 
      ORDER BY id DESC LIMIT 1
    `;
    const result = await db.query(query, [user_id]);

    // Remember to use [0] if your db.query returns the [rows, fields] array format!
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    if (rows && rows.length > 0) {
      const sub = rows[0];

      // Reconstruct the exact object shape that web-push requires
      return {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
    }

    return null; // User has no subscription
  } catch (error) {
    console.error("Error fetching push subscription:", error);
    return null;
  }
};

const checkAndSendReminders = async () => {
  console.log("Starting Advanced Activity Analysis...");

  try {
    // 1. Get all users with reminders enabled
    const usersQuery = `SELECT user_id, name, 
      reminder_days FROM users WHERE reminder_enabled = 1`;
    const [users] = await db.query(usersQuery);


    for (const user of users) {



      const N = parseInt(user.reminder_days) || 3;
      console.log("for thes days", user.reminder_days, 'user.user_id', user.user_id)
      // 2. Get all reports for this user in the last N days
      const reportsQuery = `
          SELECT activity_id, count, activity_date 
          FROM daily_report 
          WHERE user_id = ? 
          AND activity_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        `;

      const [reports] = await db.query(reportsQuery, [user.user_id, N]);
      // console.log(`reports`,reports)
      // CASE 1: Total Miss (Zero activity in N days)
      if (reports.length === 0) {
        sendPush(
          user.user_id,
          "We Miss You!",
          `Hare Krishna ${user.name},
             you haven't logged any activities for ${N} days!`
        );
        continue; // They missed everything, skip checking individual averages
      }
      console.log("case2")
      // CASE 2: Check Individual Averages
      // Fetch only activities belonging to this user or global activities (own_by = 0)
      const activitiesQuery = `
          SELECT activity_id, name, unit, activity_type, target 
          FROM fix_activities 
          WHERE user_id = ? OR own_by = 0 OR user_id IS NULL OR user_id = ''
        `;
      const [activities] = await db.query(activitiesQuery, [user.user_id]);

      let missedTargets = [];

      for (const activity of activities) {
        // Find reports specific to this activity in the last N days
        const activityReports = reports.filter(r => String(r.activity_id) === String(activity.activity_id));

        // --- Logic for Numbers & Minutes (Chanting, Hearing, Reading) ---
        if (['min', 'numb', 'rounds', 'page'].includes(activity.activity_type) || ['min', 'rounds'].includes(activity.unit)) {
          const targetPerDay = parseFloat(activity.target);
          if (isNaN(targetPerDay)) continue;

          const cumulativeTarget = targetPerDay * N;
          const threshold = cumulativeTarget / 2; // 50% Rule

          let totalAchieved = 0;
          // Calculate sum even if activityReports is empty (it will be 0)
          activityReports.forEach(r => {
            totalAchieved += parseFloat(r.count) || 0;
          });

          // If they missed it entirely (0) OR achieved less than threshold
          if (totalAchieved < threshold) {
            missedTargets.push(activity.name);
          }
        }

        // --- Logic for Time Based (Wake up time) ---
        else if (activity.activity_type === 'time' || activity.unit === 'time') {
          // If they didn't log time at all, they missed it
          if (activityReports.length === 0) {
            missedTargets.push(activity.name);
            continue;
          }

          const targetMins = parseTimeToMinutes(activity.target);
          let totalMinsAchieved = 0;

          activityReports.forEach(r => {
            totalMinsAchieved += parseTimeToMinutes(r.count);
          });

          // Average time over the days they actually logged it
          const avgMinsAchieved = totalMinsAchieved / activityReports.length;

          // If average wake up time is LATER than target time (e.g. avg is 6 AM > target 4 AM)
          if (avgMinsAchieved > targetMins) {
            missedTargets.push(activity.name);
          }
        }
      }

      // 4. Send Alert if any specific targets fell below average
      if (missedTargets.length > 0) {
        // Unique names in case of duplicates
        const uniqueMissed = [...new Set(missedTargets)].join(', ');

        await sendPush(
          user.user_id,
          "Activity Alert",
          `Hare Krishna ${user.name}, your ${N}-day average fell below target .`
        );
      }

      //
    }

    console.log("Analysis Completed.");
  } catch (error) {
    console.error("Error in checkAndSendReminders:", error);
  }
};


const sendPush = async (user_id, title, body, url) => {
  const pushSubscription = await getUserPushSubscription(user_id);
  if (pushSubscription) {
    const payload = JSON.stringify({ title, body, url: "/student/dashboard" });

    await webpush.sendNotification(pushSubscription, payload)
      .catch(err => {
        if (err.statusCode === 410) {
          console.log(`Subscription expired for user ${user_id}. You might want to delete it from DB.`);
          // OPTIONAL: Delete the expired subscription from database here
        } else {
          console.error(`Web Push Error for user ${user_id}:`, err);
        }
      });
  }
};



// Returns a list of irregular students and the reasons why
const analyzeStudentPerformance = async (user) => {
  const N = parseInt(user.reminder_days) || 3;
  const reportsQuery = `SELECT activity_id, count FROM daily_report WHERE user_id = ? AND 
      activity_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
  const [reports] = await db.query(reportsQuery, [user.user_id, N]);

  if (reports.length === 0) {
    return { isIrregular: true, reason: `No activity for ${N} days` };
  }

  // ... (Your existing logic for calculating averages) ...
  // let missedTargets = [];
  // ...

  if (missedTargets.length > 0) {
    return { isIrregular: true, reason: `Below target: ${missedTargets.join(', ')}` };
  }

  return { isIrregular: false };
};

export const notifyMentorsOfIrregularMentees = async () => {
  const [users] = await db.query(`SELECT user_id, name, reminder_days FROM users`);
  const mentorAlerts = {};

  for (const user of users) {
    const analysis = await analyzeStudentPerformance(user);

    if (analysis.isIrregular) {
      const [mentors] = await db.execute(`
            SELECT uc.counsller_id as id, c.name FROM user_counsellors uc
            JOIN users c ON uc.counsller_id = c.user_id
            WHERE uc.user_id = ? AND uc.performance_notification = 1
          `, [user.user_id]);

      for (const mentor of mentors) {
        if (!mentorAlerts[mentor.id]) mentorAlerts[mentor.id] = { name: mentor.name, count: 0 };
        mentorAlerts[mentor.id].count++;
      }
    }
  }

  // Send summary to mentors
  for (const mentorId in mentorAlerts) {
    const m = mentorAlerts[mentorId];
    await sendPush(mentorId, "Mentee Alerts", `You have ${m.count} mentees who need attention.`, "/counsellor/irregular-mentees");
  }
};
const sendDailyGlobalReminder = async () => {
  console.log("Starting daily 8:30 PM global reminder...");
  try {
    // Fetch ALL push subscriptions directly
    const query = `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions`;
    const result = await db.query(query);

    // Extract rows safely (adjust [0] based on your DB wrapper)
    const subscriptions = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    if (!subscriptions || subscriptions.length === 0) {
      console.log("No push subscriptions found to notify.");
      return;
    }
    const payload = JSON.stringify({
      title: "Daily Sadhana 🔔",
      body: "Hare Krishna! Please fill your Sadhana for today. 🙏",
      url: "/"
    });
    // Loop through and send to everyone
    for (const sub of subscriptions) {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      await webpush.sendNotification(pushConfig, payload)
        .catch(async (err) => {
          // 410 means the user revoked permission or the browser token expired
          if (err.statusCode === 410) {
            console.log(`Subscription expired for user ${sub.user_id}. Cleaning up DB...`);
            await db.query(`DELETE FROM push_subscriptions WHERE id = ?`, [sub.id]);
          } else {
            console.error(`Failed to send to user ${sub.user_id}:`, err);
          }
        });
    }

    console.log(`Finished sending global reminders to ${subscriptions.length} devices.`);
  } catch (error) {
    console.error("Error in global reminder cron:", error);
  }
};
export const freqSadhnaCronjob = () => {
  const timezone = 'Asia/Kolkata';

  // Daily at 8:30 PM IST

  cron.schedule('30 20 * * *', async () => {
    await sendDailyGlobalReminder();
  }, { timezone });

  // Runs every day at 9 AM
  cron.schedule('0 9 * * *', async () => {
    await checkAndSendReminders();
  }, { timezone });
  // Daily at 9:15 AM IST
  cron.schedule(
    '15 9 * * *',
    async () => {
      // console.log('Running notifyMentorsOfIrregularMentees:', new Date());
      await notifyMentorsOfIrregularMentees();
    },
    { timezone }
  );
  // Every Saturday at 10:00 AM IST
  cron.schedule(
    '0 10 * * 6',
    async () => {
      // console.log('Running sendSadhanaPushReminders:', new Date());
      await sendSadhanaPushReminders();
    },
    { timezone }
  );

  console.log(`Sadhana cron jobs initialized (${timezone})`);
};

// export const freqSadhnaCronjob = () => {

//   cron.schedule('0 20 * * *', async () => {
//     await sendDailyGlobalReminder();
//   });

//   // Runs every day at 9 AM
//   cron.schedule('0 20 * * *', async () => {
//     await checkAndSendReminders();
//   });

//   cron.schedule('15 9 * * *', async () => {
//     await notifyMentorsOfIrregularMentees();
//   });
//    cron.schedule('0 10 * * 6', async () => {
//     await sendSadhanaPushReminders();
//   });

// };