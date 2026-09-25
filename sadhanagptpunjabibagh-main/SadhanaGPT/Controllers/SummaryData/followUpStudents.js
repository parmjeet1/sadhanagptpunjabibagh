import db from '../../../config/database.js';
import moment from 'moment';
import { asyncHandler, mergeParam } from "../../../utils/utils.js";

/**
 * API to fetch students needing follow-up for the last week (Monday to Sunday).
 * Ordered by minimum marks on top.
 */
export const getFollowUpStudents = asyncHandler(async (req, res) => {
    try {
        const { center_id, user_id } = mergeParam(req);
        
        // Date range: last Monday → last Sunday (matching weeklySummaryUpdate)
        const lastSunday = moment().day(0).startOf('day'); // Most recent Sunday
        const lastMonday = moment(lastSunday).subtract(6, 'days').startOf('day'); // Monday before it
        
        const fromDate = lastMonday.format('YYYY-MM-DD');
        const toDate = lastSunday.format('YYYY-MM-DD');

        const daysInPeriod = moment(toDate).diff(moment(fromDate), 'days') + 1;

        let query = `
            SELECT 
                u.user_id AS student_id,
                u.name AS student_name,
                COALESCE(SUM(sr.total_marks), 0) AS total_marks,
                COALESCE(MAX(sr.max_possible_marks), 0) AS daily_max_marks
            FROM users u
            LEFT JOIN summary_report sr ON u.user_id = sr.user_id AND sr.activity_date BETWEEN ? AND ?
        `;
        
        const params = [fromDate, toDate];

        // Filter by center if requested
        if (center_id) {
            query += `
                WHERE u.user_id IN (
                    SELECT user_id FROM user_assignments WHERE center_id = ?
                )
            `;
            params.push(center_id);
        } else if (user_id) {
            // Filter by counsellor's students
            query += `
                WHERE u.user_id IN (
                    SELECT user_id FROM user_assignments WHERE counsellor_id = ?
                )
            `;
            params.push(user_id);
        }

        query += `
            GROUP BY u.user_id, u.name
        `;

        const [rows] = await db.execute(query, params);
        console.log(`[FollowUp] Fetched for user_id ${user_id}:`, rows.length, "rows");

        let studentsList = rows.map(student => {
            const numericMarks = Number(student.total_marks);
            const dailyMaxMarks = Number(student.daily_max_marks);
            const maxMarks = dailyMaxMarks * daysInPeriod;
            const percentage = maxMarks > 0 ? Math.round((numericMarks / maxMarks) * 100) : 0;
            return {
                student_id: student.student_id,
                student_name: student.student_name,
                total_marks: numericMarks,
                percentage: percentage
            };
        });

        // Only include students who have less than 50% marks for follow-up
        studentsList = studentsList.filter(student => student.percentage < 50);

        // Sort by percentage ascending for FollowUp (lowest on top)
        studentsList.sort((a, b) => a.percentage - b.percentage);

        let currentRank = 1;
        let previousPercentage = null;

        // Assign numbers based on percentage
        const followUpStudents = studentsList.map((student, index) => {
            if (previousPercentage !== null && student.percentage > previousPercentage) {
                currentRank = index + 1;
            }
            previousPercentage = student.percentage;

            return {
                ...student,
                rank: currentRank
            };
        });

        return res.json({
            status: 1,
            code: 200,
            message: ["Follow-up students fetched successfully"],
            data: {
                period: `${fromDate} to ${toDate}`,
                students: followUpStudents
            }
        });

    } catch (error) {
        console.error("[FollowUp] Error fetching follow-up students:", error);
        return res.json({
            status: 0,
            code: 500,
            message: ["Failed to fetch follow-up students"]
        });
    }
});
