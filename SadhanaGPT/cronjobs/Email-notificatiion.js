// Assumes you have your db connection, insertRecord helper, and EmailQueue imported at the top
import EmailQueue from '../../utils/emails/emailQueue.js';
import db from '../../config/database.js'
import fs from 'fs';
import path from 'path';
import os from 'os';
export const processInactivityReminders = async () => {
    try {
        const delay_dates = 1;
        
        // 1. Efficiently query the database for inactive users.
        // It checks two things:
        // A) The user has reports, but their LAST report was exactly 7 days ago.
        // B) The user has NO reports (last_activity is NULL), but their account was created 7 days ago.
        const [inactiveUsers] = await db.execute(`
            SELECT 
                u.user_id, 
                u.email, 
                u.name, 
                u.created_at, 
                MAX(dr.activity_date) as last_activity
            FROM users u
            LEFT JOIN daily_report dr ON u.user_id = dr.user_id
            WHERE u.user_type = 'student'       -- Only check students
            GROUP BY u.user_id
            HAVING 
                (DATEDIFF(CURDATE(), MAX(dr.activity_date)) = ?) 
                OR 
                (MAX(dr.activity_date) IS NULL AND DATEDIFF(CURDATE(), u.created_at) = ?)
        `, [delay_dates, delay_dates]);

        console.log(inactiveUsers)

        if (inactiveUsers.length === 0) {
            console.log("No inactive users found today.");
            return;
        }

        console.log(`Found ${inactiveUsers.length} users with exactly ${delay_dates} days missing. Dispatching notifications...`);

        // 2. Iterate through each missing user and trigger Notifications + Emails
        for (const user of inactiveUsers) {
            const subject = "We miss you on SadhanaGPT! 🙏";
            const notificationHeading = "Time to Log Your Sadhana";
            const description = `Hare Krsna ${user.name.split(' ')[0]}, it's been ${delay_dates} days since your last update. Please log your activities!`;
            
            // --- A) SEND EMAIL ---
            const htmlContent = `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2>Hare Krsna ${user.name}!</h2>
                    <p>It's been ${delay_dates} since you last logged your spiritual activities.</p>
                    <p>Consistency is the key to spiritual growth. Please take 2 minutes to update your Sadhana status.</p>
                    <a href="https://sadhanagpt.com/student/dashboard" style="background:#1a73e8; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block; margin-top:10px;">
                       Log Activities Now
                    </a>
                </div>
            `;
            EmailQueue.addEmail(user.email, subject, htmlContent);

            // --- B) CREATE IN-APP NOTIFICATION ---
            // using "system" or "admin" as panel_from since it's an automated ping
            await insertRecord(
                "notifications",
                [
                    "heading",
                    "description",
                    "module_name",
                    "panel_to",
                    "panel_from",
                    "created_by",
                    "receive_id",
                    "href"
                ],
                [
                    notificationHeading,
                    description,
                    "custom_notification",
                    "student",
                    "admin",     
                    "SYSTEM",             // Marking creator as SYSTEM algorithm 
                    user.user_id,         // Mapping dynamically to the fetched user's ID
                    "custom_notification" // Fallback href
                ]
            );
        }

        console.log(`Successfully queued ${inactiveUsers.length} emails and notifications!`);

    } catch (error) {
        console.error("Critical error in processInactivityReminders:", error);
    }
};


export const dispatchWeeklyCounsellorReports = async () => {
    try {
        console.log("Starting generation of dynamic CSV reports...");
        // 1. Single massive fetch parsing every active counsellor's specific customized window
        const [rows] = await db.execute(`
            SELECT 
                uc.counsller_id, 
                c.email AS counsellor_email,
                c.name AS counsellor_name,
                c.report_frequency_days,
                u.name AS student_name,
                u.user_id,
                a.name AS activity_name,
                dr.count,
                DATE_FORMAT(dr.activity_date, '%Y-%m-%d') as report_date
            FROM user_counsellors uc
            JOIN users c ON uc.counsller_id = c.user_id
            JOIN users u ON uc.user_id = u.user_id
            
            -- Keep as LEFT JOIN but inject custom counsellor window specifically
            LEFT JOIN daily_report dr 
                 ON u.user_id = dr.user_id 
                 AND dr.activity_date >= DATE_SUB(CURDATE(), INTERVAL c.report_frequency_days DAY)
                 
            LEFT JOIN fix_activities a ON dr.activity_id = a.activity_id 
            
            WHERE c.auto_report_status = 1 
            ORDER BY uc.counsller_id, u.name, dr.activity_date DESC
        `);
        if (rows.length === 0) {
            console.log("No activities found in the given timeframe. Aborting report.");
            return;
        }
        // 2. Group the SQL data cleanly by Counsellor ID
        const counsellorGroups = {};
        rows.forEach(row => {
            if (!counsellorGroups[row.counsller_id]) {
                counsellorGroups[row.counsller_id] = {
                    email: row.counsellor_email,
                    name: row.counsellor_name,
                    report_days: row.report_frequency_days, // Save their custom frequency
                    data: []
                };
            }
            counsellorGroups[row.counsller_id].data.push(row);
        });
        const activeCounsellors = Object.keys(counsellorGroups);
        console.log(`Sending customized CSV reports to ${activeCounsellors.length} counsellors...`);
        // 3. Generate a Blocked CSV file for each Counsellor
        for (const counsellorId of activeCounsellors) {
            const counsellor = counsellorGroups[counsellorId];
            
            // A. Find all unique activities across the counsellor's students
            const activityColumns = [...new Set(counsellor.data.map(d => d.activity_name || "Unknown"))];
            let csvContent = ""; // Start blank
            // B. Group the data cleanly by Student ID first, then Date
            const studentsGroups = {};
            counsellor.data.forEach(d => {
                if (!studentsGroups[d.user_id]) {
                     studentsGroups[d.user_id] = {
                         name: d.student_name,
                         dates: {} 
                     };
                }
                
                // If they have no valid date (empty report), skip adding dates but they still have a header block
                if (d.report_date) {
                    if (!studentsGroups[d.user_id].dates[d.report_date]) {
                         studentsGroups[d.user_id].dates[d.report_date] = {};
                    }
                    const actName = d.activity_name || "Unknown";
                    studentsGroups[d.user_id].dates[d.report_date][actName] = d.count !== null ? d.count : '';
                }
            });
            // C. Build the CSV Content Block by Block (Like your screenshot!)
            Object.values(studentsGroups).forEach(student => {
                csvContent += `${student.name}\n`;
                csvContent += `dates,${activityColumns.join(',')}\n`;
                const sortedDates = Object.keys(student.dates).sort((a,b) => b.localeCompare(a));
                
                // If the student has NO dates, output a blank row indicating they did nothing
                if (sortedDates.length === 0) {
                     const emptyRow = activityColumns.map(() => '""').join(',');
                     csvContent += `No Data Logged,${emptyRow}\n`;
                } else {
                    sortedDates.forEach(date => {
                         const rowMap = student.dates[date];
                         const activityValues = activityColumns.map(col => {
                              const rowValue = rowMap[col];
                              return rowValue !== undefined && rowValue !== '' ? `"${rowValue}"` : `""`; 
                         });
                         csvContent += `${date},${activityValues.join(',')}\n`;
                    });
                }
                
                // Blank spacer row before the next student starts
                csvContent += `\n`;
            });
            // 4. Write CSV temporarily to server memory and Dispatch
            const fileName = `mentee_report_${counsellorId}_${Date.now()}.csv`;
            const filePath = path.join(os.tmpdir(), fileName);
            fs.writeFileSync(filePath, csvContent);
            // Dynamically inject their specific 'report_days' preference into the email
            const subject = `Weekly Sadhana Report Document (${counsellor.report_days} Days)`;
            const html = `
                <div style="padding: 20px; font-family:sans-serif;">
                    <h2>Hare Krsna ${counsellor.name || ''},</h2>
                    <p>Attached is your customized structured CSV report showing all your students' sadhana logs from the last ${counsellor.report_days} days.</p>
                </div>
            `;
            
            const attachment = {
                filename: `Mentee_Report_Last_${counsellor.report_days}_Days.csv`,
                path: filePath,
                contentType: 'text/csv'
            };
            EmailQueue.addEmail(counsellor.email, subject, html, attachment);
        }
        console.log("✅ Reports parsed, CSVs created, and queued for email delivery successfully.");
    } catch (error) {
        console.error("Critical error in dispatchWeeklyCounsellorReports:", error);
    }
};


export const sendBulknEmails = async (req, res) => {
  console.log(" started bulk email process");
  
  try {
    // 1. Read emails from the JSON file at the backend root
    const emailsFilePath = path.join(process.cwd(), 'emails.json');
    const emailsList = JSON.parse(fs.readFileSync(emailsFilePath, 'utf8'));

    // 2. Define the path for the image attachment, also at the backend root
    const imagePath = path.join(process.cwd(), 'image.jpeg');

    // 3. Loop through the array and enqueue emails using your existing EmailQueue
    for (const email of emailsList) {
      if (!email || typeof email !== 'string' || !email.includes('@')) continue;

const subject = 'Investment & Partnership Opportunity – Hospitality Property Near Badrinath / Govindghat (Uttarakhand)';

        const html = `
<table width="100%" cellpadding="0" cellspacing="0"
  style="font-family:Arial,sans-serif;background:#f0ece4;padding:30px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:10px;overflow:hidden">

      <!-- HEADER -->
      <tr><td style="background:linear-gradient(135deg,#1a3a2a,#2d5a3d);padding:32px 36px">
        <p style="color:#c9a96e;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px">
          Partnership &amp; Investment Inquiry
        </p>
        <h1 style="color:#ffffff;font-size:20px;margin:0;line-height:1.4">
          Hospitality Property – Badrinath / Govindghat Corridor
        </h1>
      </td></tr>

      <!-- BODY -->
      <tr><td style="padding:30px 36px;color:#3a3a3a;font-size:15px;line-height:1.8">

        <p>Dear Team,</p>
        <p style="margin-top:14px">
          We are looking for a construction partner or investor to help complete
          a hospitality property in one of Uttarakhand's most active pilgrimage
          and trekking corridors.
        </p>

        <!-- WHAT WE HAVE -->
        <p style="margin:22px 0 8px;color:#2d5a3d;font-weight:700">What We Have</p>
        <ul style="margin:0;padding-left:20px">
          <li>Land and partial structure ready</li>
          <li>6 rooms + Swiss cottage space planned</li>
          <li>~15 km from Badrinath, ~3 km from Govindghat
              (Valley of Flowers base), near Pandukeshwar</li>
        </ul>

        <!-- WHAT WE NEED -->
        <p style="margin:22px 0 8px;color:#2d5a3d;font-weight:700">What We Need</p>
        <ul style="margin:0;padding-left:20px">
          <li>A partner willing to fund or co-invest in completing the construction</li>
        </ul>

        <!-- WHAT WE OFFER -->
        <p style="margin:22px 0 8px;color:#2d5a3d;font-weight:700">What We Offer in Return</p>
        <ul style="margin:0;padding-left:20px">
          <li>Long-term lease agreement once construction is complete</li>
          <li>Stable recurring income backed by strong seasonal demand (May–Nov)</li>
          <li>Full operational control handed to partner under agreed terms</li>
        </ul>

        <p style="margin-top:22px">
          Simple deal — you invest in completion, we sign a long-term lease.
          Happy to share Google Maps location and site photos at your convenience.
        </p>

        <!-- CTA BUTTONS -->
        <p style="margin:26px 0 8px">
          <a href="YOUR_GOOGLE_MAPS_LINK"
            style="background:#2d5a3d;color:#fff;padding:11px 22px;
            border-radius:6px;text-decoration:none;font-size:14px;
            margin-right:10px;display:inline-block">
            📍 View Location
          </a>
          <a href="YOUR_PHOTOS_LINK"
            style="background:#f7f4ef;color:#2d5a3d;padding:11px 22px;
            border-radius:6px;text-decoration:none;font-size:14px;
            border:1.5px solid #2d5a3d;display:inline-block">
            📸 View Site Photos
          </a>
        </p>

        <!-- SIGNATURE -->
        <p style="margin-top:32px;border-top:1px solid #eee;padding-top:20px">
          Warm regards,<br/>
          <strong style="font-size:17px;color:#1a3a2a">Paramjeet</strong><br/>
          <a href="tel:+919410934120"
            style="color:#2d5a3d;text-decoration:none">
            +91 94109 34120
          </a>
        </p>

      </td></tr>
    </table>
  </td></tr>
</table>
`;
      const attachment = {
        filename: 'image.jpg',
        path: imagePath 
      };

      // Avoid using a raw transporter since your app uses EmailQueue
      EmailQueue.addEmail(email, subject, html, attachment);
      console.log(`Email queued successfully for ${email}`);
    }

    return res.json({ status: 1, code: 200, message: "Bulk emails queued successfully" });

  } catch (error) {
    console.error("Error during bulk email dispatch:", error);
    return res.status(500).json({ status: 0, code: 500, message: "Failed to send emails", error: error.message });
  }
};
