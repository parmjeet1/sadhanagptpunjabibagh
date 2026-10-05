import db from '../../../config/database.js';

import moment from 'moment';
import { asyncHandler, mergeParam } from "../../../utils/utils.js";

/**
 * API to fetch students rank for the last week (Monday to Sunday)
 */
export const getStudentRank = asyncHandler(async (req, res) => {
    try {
        const { center_id, user_id } = mergeParam(req);
        const limit = parseInt(req.query.limit) || null;
        const page = parseInt(req.query.page) || 1;
        const sort = req.query.sort || 'desc';
        
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
        console.log("(query, params)",query, params);

       

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

        // Sort by total_marks descending to compute ranks (Rank #1 = highest marks)
        studentsList.sort((a, b) => b.total_marks - a.total_marks || b.percentage - a.percentage || a.student_name.localeCompare(b.student_name));

        let currentRank = 1;
        let previousMarks = null;

        // Assign rank numbers based on total_marks
        let rankedStudents = studentsList.map((student, index) => {
            if (previousMarks !== null && student.total_marks < previousMarks) {
                currentRank = index + 1;
            }
            previousMarks = student.total_marks;

            return {
                ...student,
                rank: currentRank
            };
        });

        // Apply display sorting for output page:
        // - sort === 'asc' (Students Need Follow-up): Lowest rank / worst students first (rank DESC)
        // - sort === 'desc' (Top Ranks): Highest rank / best students first (rank ASC)
        if (sort === 'asc') {
            rankedStudents.sort((a, b) => b.rank - a.rank || a.student_name.localeCompare(b.student_name));
        } else {
            rankedStudents.sort((a, b) => a.rank - b.rank || a.student_name.localeCompare(b.student_name));
        }

        const total = rankedStudents.length;
        let total_page = 1;
        
        if (limit) {
            total_page = Math.ceil(total / limit);
            const startIndex = (page - 1) * limit;
            rankedStudents = rankedStudents.slice(startIndex, startIndex + limit);
        }

        return res.json({
            status: 1,
            code: 200,
            message: ["Student ranks fetched successfully"],
            total: total,
            page: page,
            total_page: total_page,
            data: {
                period: `${fromDate} to ${toDate}`,
                ranks: rankedStudents
            }
        });

    } catch (error) {
        console.error("[Rank] Error fetching student ranks:", error);
        return res.json({
            status: 0,
            code: 500,
            message: ["Failed to fetch student ranks"]
        });
    }
});
