import moment from "moment";
import db from "../../../config/database.js";
import { asyncHandler, mergeParam } from "../../../utils/utils.js";
import { getEffectiveScheme } from "./effectiveScheme.js";

/**
 * POST /daily-marks-breakdown   { activity_date? }   (the person always comes from the login token)
 *
 * The marks of ONE day activity by activity, for the "Today's Sadhana Score" window:
 * what the person earned for each activity and the most that activity can give under the scheme
 * that applies to them (own scheme rule for the activity, else the default scheme's).
 * The totals follow the same rule as /daily-score (a master activity held twice counts once in the maximum).
 */
export const getDailyMarksBreakdown = asyncHandler(async (req, resp) => {
  try {
    const uid = req.user?.user_id;
    if (!uid) return resp.json({ status: 0, code: 401, message: ["Please log in again."] });

    const { activity_date } = mergeParam(req);
    const date = activity_date
      ? moment(activity_date).format("YYYY-MM-DD")
      : moment().utcOffset("+05:30").format("YYYY-MM-DD");

    const effective = await getEffectiveScheme(uid);

    const [rows] = await db.query(
      `SELECT fa.activity_id, fa.name, fa.activity_type, fa.unit, fa.master_activity_id,
              dr.count AS count, COALESCE(dr.marks, 0) AS earned,
              COALESCE(
                (SELECT MAX(r.marks) FROM marking_rules r
                  WHERE r.master_activity_id = fa.master_activity_id AND r.status = 1
                    AND r.frequency = 'daily' AND r.scheme_id = ?),
                (SELECT MAX(r2.marks) FROM marking_rules r2
                  WHERE r2.master_activity_id = fa.master_activity_id AND r2.status = 1
                    AND r2.frequency = 'daily' AND r2.scheme_id = 1),
                0
              ) AS max_marks
       FROM fix_activities fa
       LEFT JOIN daily_report dr
              ON dr.activity_id = fa.activity_id AND dr.user_id = fa.user_id AND DATE(dr.activity_date) = ?
       WHERE fa.user_id = ? AND fa.master_activity_id IS NOT NULL AND fa.master_activity_id > 0
       ORDER BY fa.activity_id ASC`,
      [effective.schemeId, date, uid]
    );

    const seenMasters = new Set();
    let maxTotal = 0;
    let earnedTotal = 0;
    const activities = rows.map((r) => {
      const max = Number(r.max_marks) || 0;
      const earned = Number(r.earned) || 0;
      earnedTotal += earned;
      const master = String(r.master_activity_id);
      if (!seenMasters.has(master)) { seenMasters.add(master); maxTotal += max; }
      return {
        activity_id: r.activity_id,
        name: r.name,
        activity_type: r.activity_type,
        unit: r.unit,
        count: r.count === undefined ? null : r.count,
        earned,
        max,
      };
    });

    return resp.json({
      status: 1,
      code: 200,
      message: ["Marks breakdown fetched successfully!"],
      data: {
        activity_date: date,
        scheme_id: effective.schemeId,
        applied_source: effective.source,
        earned_total: earnedTotal,
        max_total: maxTotal,
        activities,
      },
    });
  } catch (error) {
    console.error("Error fetching marks breakdown:", error);
    return resp.json({ status: 0, code: 500, message: ["Error fetching marks breakdown."] });
  }
});
