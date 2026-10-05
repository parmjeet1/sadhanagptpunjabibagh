import db from '../../../config/database.js';
import cron from 'node-cron';
import moment from 'moment';
import { createNotification } from '../../../utils/utils.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const dailyStudentSummary = async (userId, targetDate) => {
    try {
        const query = `SELECT activity_id, marks FROM daily_report WHERE user_id = ? AND activity_date = ?`;
        const [reports] = await db.execute(query, [userId, targetDate]);

        let totalMarks = 0;
        let completedActivities = 0;

        if (reports && reports.length > 0) {
            completedActivities = reports.length;
            for (const report of reports) {
                totalMarks += parseFloat(report.marks) || 0;
            }
        }

        // Count total Assigned activities to User

        const totalAssigned = `SELECT COUNT(*) as total_activities FROM fix_activities WHERE user_id = ?`;

        const [countResult] = await db.execute(totalAssigned, [userId]);
        const totalActivitiesCount = countResult[0].total_activities || 0;

        // Insert data in summary_report table only if all activities are completely filled

        if (completedActivities === totalActivitiesCount && totalActivitiesCount > 0) {

            const marksQuery = `SELECT SUM(m.marks) as max_marks FROM fix_activities f
                LEFT JOIN marking_rules m ON f.master_activity_id = m.master_activity_id
                WHERE f.user_id = ? 
                  AND m.status = 1 
                  AND m.frequency = 'daily'
                  AND m.is_max_marks = 1
            `;
            const [maxMarksResult] = await db.execute(marksQuery, [userId]);

            // Extract the value safely
            const maxPossibleMarks = maxMarksResult[0].max_marks || 0;

            const saveQuery = `INSERT INTO summary_report (user_id, activity_date, total_marks, max_possible_marks, completed_activities, total_activities, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE total_marks = VALUES(total_marks), max_possible_marks = VALUES(max_possible_marks), completed_activities = VALUES(completed_activities), total_activities = VALUES(total_activities), updated_at = NOW()`;

            await db.execute(saveQuery, [userId, targetDate, totalMarks, maxPossibleMarks, completedActivities, totalActivitiesCount]);

            console.log(`Summary report generated for user ${userId} on date ${targetDate}`);
        } else {
            console.log(`Summary report skipped for user ${userId}: Completed ${completedActivities} out of ${totalActivitiesCount} activities.`);
        }
    } catch (error) {
        console.error(`Error generating summary report for user ${userId} on date ${targetDate}`, error);
        throw error;
    }
};

export const Cron_Job = async () => {
    cron.schedule(`0 1 * * *`, async () => {
        try {
            console.log("Running 1:00 AM Cron Job to auto-fill missing student data...");

            // step 1 :  Get the date for which the summary report needs to be generated

            const targetDate = moment().subtract(1, 'days').format(`YYYY-MM-DD`);

            // Step 2: find Users whose activity is not completed
            const findMissingUsersQuery = `SELECT
            f.user_id,
            COUNT(DISTINCT f.activity_id) AS assigned,
            COUNT(DISTINCT d.activity_id) AS completed
            FROM fix_activities f
            LEFT JOIN daily_report d
                ON f.user_id = d.user_id
                AND f.activity_id = d.activity_id
                AND d.activity_date = ?
            GROUP BY f.user_id
            HAVING completed < assigned`;

            const [missingUsersData] = await db.execute(findMissingUsersQuery, [targetDate]);
            if (missingUsersData.length === 0) {
                console.log("No missing data found for yesterday. Everyone completed their activities!");
                return;
            }

            // Step 3: Loop and Auto-fill missing student data
            for (const row of missingUsersData) {
                const userId = row.user_id;

                // 3a. Find the EXACT activities they missed
                const missedActivitiesQuery = `
                    SELECT f.activity_id 
                    FROM fix_activities f
                    LEFT JOIN daily_report d 
                        ON f.user_id = d.user_id 
                        AND f.activity_id = d.activity_id 
                        AND d.activity_date = ?
                    WHERE f.user_id = ? AND d.activity_id IS NULL
                `;
                const [missedActivities] = await db.execute(missedActivitiesQuery, [targetDate, userId]);

                // 3b. Insert 0 marks for every missed activity
                for (const activity of missedActivities) {
                    const insertZero = `
                        INSERT INTO daily_report (user_id, activity_id, count, marks, activity_date, created_at, updated_at) 
                        VALUES (?, ?, 0, 0, ?, NOW(), NOW())
                    `;
                    await db.execute(insertZero, [userId, activity.activity_id, targetDate]);
                }

                // 3c. Now that they technically have completed all activities (with 0s), 
                // call your existing summary function to generate their summary_report!
                await dailyStudentSummary(userId, targetDate);
                await sleep(500);
            }

            console.log(`Cron Job Success: Auto-filled missing data for ${missingUsersData.length} users.`);

        }
        catch (error) {
            console.error(`Error running Cron Job`, error);
            throw error;
        }
    });
};

// ─── Weekly Summary Report Update ───────────────────────────────────────────

/**
 * Aggregates one week's daily_report data per user per weekly activity,
 * scores it against weekly marking_rules, and upserts into summary_report
 * using the last Sunday as activity_date.
 */
const weeklySummaryUpdate = async () => {
    try {
        // ── Date range: last Monday → last Sunday ────────────────────────────
        const lastSunday  = moment().day(0).subtract(0, 'weeks').startOf('day'); // most recent Sunday
        const lastMonday  = moment(lastSunday).subtract(6, 'days').startOf('day');
        const fromDate    = lastMonday.format('YYYY-MM-DD');
        const toDate      = lastSunday.format('YYYY-MM-DD');
        const summaryDate = toDate; // store on Sunday date

        console.log(`[WeeklyJob] Processing week: ${fromDate} → ${toDate}`);

        // ── Step 1: Find all users who have at least one weekly activity ─────
        const [usersWithWeekly] = await db.execute(`
            SELECT DISTINCT fa.user_id
            FROM fix_activities fa
            INNER JOIN marking_rules mr
                ON fa.master_activity_id = mr.master_activity_id
            WHERE mr.frequency = 'Weekly'
              AND mr.status = 1
        `);

        if (!usersWithWeekly.length) {
            console.log('[WeeklyJob] No users with weekly activities found. Skipping.');
            return;
        }

        console.log(`[WeeklyJob] Found ${usersWithWeekly.length} user(s) to process.`);

        for (const { user_id } of usersWithWeekly) {

            try {
                // ── Step 2: Get user's weekly activities with their type ──────
                const [weeklyActivities] = await db.execute(`
                    SELECT
                        fa.activity_id,
                        fa.activity_type,
                        fa.master_activity_id,
                        fa.name
                    FROM fix_activities fa
                    INNER JOIN marking_rules mr
                        ON fa.master_activity_id = mr.master_activity_id
                    WHERE fa.user_id = ?
                      AND mr.frequency = 'Weekly'
                      AND mr.status = 1
                    GROUP BY fa.activity_id
                `, [user_id]);

                if (!weeklyActivities.length) {
                    await sleep(500);
                    continue;
                }

                // ── Step 3: Get user's center for rule priority ───────────────
                const [[assignment]] = await db.execute(`
                    SELECT center_id FROM user_assignments
                    WHERE user_id = ? ORDER BY id DESC LIMIT 1
                `, [user_id]);
                const center_id = assignment?.center_id || 0;

                let totalMarks       = 0;
                let maxPossibleMarks = 0;

                for (const activity of weeklyActivities) {
                    const { activity_id, activity_type, master_activity_id } = activity;

                    // ── Step 4: Fetch this week's daily_report rows ────────────
                    const [rows] = await db.execute(`
                        SELECT count FROM daily_report
                        WHERE user_id = ?
                          AND activity_id = ?
                          AND activity_date BETWEEN ? AND ?
                    `, [user_id, activity_id, fromDate, toDate]);

                    if (!rows.length) continue;

                    // ── Step 5: Aggregate by activity_type ────────────────────
                    let aggregatedValue = 0;

                    if (activity_type === 'time') {
                        // duration-based: sum all minutes (stored as "HH:MM", "8:20 AM", or numeric)
                        for (const r of rows) {
                            const raw = r.count;
                            if (raw === null || raw === undefined || raw === '') continue;
                            if (typeof raw === 'number') {
                                aggregatedValue += raw;
                            } else {
                                const str = String(raw).trim();
                                if (!isNaN(Number(str))) {
                                    aggregatedValue += Number(str);
                                } else {
                                    const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
                                    if (match) {
                                        let hours = parseInt(match[1], 10);
                                        const mins = parseInt(match[2], 10);
                                        const ampm = match[3] ? match[3].toUpperCase() : null;
                                        if (ampm === 'PM' && hours < 12) hours += 12;
                                        if (ampm === 'AM' && hours === 12) hours = 0;
                                        aggregatedValue += (hours * 60) + mins;
                                    }
                                }
                            }
                        }
                    } else if (activity_type === 'yes_no' || activity_type === 'boolean') {
                        // yes/no: count entries where count is 1, 'yes', or 'true'
                        for (const r of rows) {
                            const valStr = String(r.count).toLowerCase().trim();
                            if (Number(r.count) === 1 || valStr === 'yes' || valStr === 'true' || r.count === true) {
                                aggregatedValue += 1;
                            }
                        }
                    } else {
                        // count-based: sum totals
                        for (const r of rows) {
                            aggregatedValue += Number(r.count) || 0;
                        }
                    }

                    // ── Step 6: Fetch weekly marking_rules (center-specific first) ──
                    const [rules] = await db.execute(`
                        SELECT condition_operator, condition_value, marks, center_id
                        FROM marking_rules
                        WHERE center_id IN (?, 0)
                          AND master_activity_id = ?
                          AND frequency = 'Weekly'
                          AND status = 1
                        ORDER BY center_id = ? DESC
                    `, [center_id, master_activity_id, center_id]);

                    if (!rules.length) continue;

                    // ── Step 7: Compare aggregated value against rules ─────────
                    let bestMarks = 0;
                    for (const rule of rules) {
                        let ruleVal;
                        const condLower = String(rule.condition_value).toLowerCase().trim();
                        if (condLower === 'yes' || condLower === 'true') {
                            ruleVal = 1;
                        } else if (condLower === 'no' || condLower === 'false') {
                            ruleVal = 0;
                        } else {
                            ruleVal = parseFloat(rule.condition_value);
                        }
                        let cCount   = aggregatedValue;
                        let matched  = false;

                        switch (rule.condition_operator) {
                            case '>':  matched = cCount >  ruleVal; break;
                            case '<':  matched = cCount <  ruleVal; break;
                            case '>=': matched = cCount >= ruleVal; break;
                            case '<=': matched = cCount <= ruleVal; break;
                            case '=':
                            case '==': matched = cCount == ruleVal; break;
                            case '!=': matched = cCount != ruleVal; break;
                        }

                        if (matched) {
                            const ruleMarks = Number(rule.marks);
                            if (ruleMarks > bestMarks) bestMarks = ruleMarks;
                        }
                    }

                    totalMarks += bestMarks;

                    // Track max possible (highest marks rule for this activity)
                    const maxRule = rules.reduce((acc, r) => Math.max(acc, Number(r.marks)), 0);
                    maxPossibleMarks += maxRule;
                }

                // ── Step 8: Upsert into summary_report ───────────────────────
                await db.execute(`
                    INSERT INTO summary_report
                        (user_id, activity_date, total_marks, max_possible_marks,
                         completed_activities, total_activities, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                    ON DUPLICATE KEY UPDATE
                        total_marks          = VALUES(total_marks),
                        max_possible_marks   = VALUES(max_possible_marks),
                        completed_activities = VALUES(completed_activities),
                        total_activities     = VALUES(total_activities),
                        updated_at           = NOW()
                `, [
                    user_id,
                    summaryDate,
                    totalMarks,
                    maxPossibleMarks,
                    weeklyActivities.length,
                    weeklyActivities.length
                ]);

                console.log(`[WeeklyJob] ✅ User ${user_id} → marks: ${totalMarks}/${maxPossibleMarks} saved on ${summaryDate}`);

                // Send notification to check ranking
                await createNotification(
                    "Weekly Ranking Available!",
                    "Your weekly ranking has been calculated. Check out how you performed last week on the Inspiration board!",
                    "weekly_ranking",
                    "student",
                    "system",
                    0,
                    user_id,
                    "/student/inspiration"
                );

            } catch (userErr) {
                console.error(`[WeeklyJob] ❌ Error processing user ${user_id}:`, userErr.message);
            }

            await sleep(500); // 500ms delay between each user
        }

        console.log(`[WeeklyJob] Done. Processed ${usersWithWeekly.length} user(s).`);

    } catch (error) {
        console.error(`[WeeklyJob] Fatal error in weeklySummaryUpdate:`, error);
        throw error;
    }
};

// ─── Monday 2 AM Cron Job ────────────────────────────────────────────────────
export const WeeklyJob = async () => {
    // Runs at 02:00 AM every Monday (IST)
    cron.schedule('0 2 * * 1', async () => {
        console.log(`[WeeklyJob] 🕑 Triggered at ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        try {
            await weeklySummaryUpdate();
        } catch (err) {
            console.error('[WeeklyJob] Cron failed:', err.message);
        }
    }, { timezone: 'Asia/Kolkata' });

    console.log('[WeeklyJob] Cron registered: every Monday at 2:00 AM IST');
};

// // TEMP TEST LINE — REMOVE AFTER TESTING
// weeklySummaryUpdate().then(() => console.log('[WeeklyJob] ✅ Manual test complete')).catch(e => console.error('[WeeklyJob] ❌ Test failed:', e));
