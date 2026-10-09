/**
 * Shared percentage + rank rules for every ranking screen
 * (daily / previous day / 7-day student ranking, counsellor weekly rank, follow-up list).
 *
 * Percentage = marks earned in the period / (the student's own daily maximum x number of days).
 * The daily maximum comes from the scheme that applies to the student (sub-group scheme, else group
 * scheme, else the student's own "My Marking Scheme" if switched on, else default scheme 1) and only
 * counts the activities the student really has, once each.
 * Rank = by percentage (highest first), then by total marks, then by name. Same percentage AND
 * same marks = same rank. Students with no entries at all are kept at the bottom.
 */

import { effectiveSchemeSql } from "../Marking Rules/effectiveScheme.js";

/** Rounds to 2 decimals (kept as a number). */
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Daily maximum marks per student.
 * Same rule as calculateDailySadhanaScore (own scheme's highest daily rule for an activity, else the
 * default scheme's), but for many students in one query, and a master activity held twice by the
 * same student is counted once.
 * @param {object} db   mysql2 pool (needs .query)
 * @param {string[]} userIds
 * @returns {Promise<Map<string, number>>} user_id -> daily maximum (0 when nothing is known)
 */
export const getDailyMaxByUser = async (db, userIds) => {
  const result = new Map();
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return result;

  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT 
      sub.user_id,
      SUM(sub.activity_max) AS daily_max
    FROM (
      SELECT 
        fa.user_id,
        COALESCE(fa.master_activity_id, a.id) AS master_activity_id,
        COALESCE(
          MAX(CASE WHEN mr.scheme_id = s.scheme_id THEN mr.marks END),
          MAX(CASE WHEN mr.scheme_id = 1 THEN mr.marks END),
          0
        ) AS activity_max
      FROM fix_activities fa
      LEFT JOIN activities a ON (fa.master_activity_id = a.id OR (fa.master_activity_id IS NULL AND LOWER(TRIM(fa.name)) = LOWER(TRIM(a.name))))
      JOIN (
        SELECT u.user_id,
               ${effectiveSchemeSql({ label: "l", center: "c", userExpr: "u.user_id" })} AS scheme_id
        FROM users u
        LEFT JOIN user_assignments ua
               ON ua.id = (SELECT MAX(ua2.id) FROM user_assignments ua2 WHERE ua2.user_id = u.user_id)
        LEFT JOIN labels_list l ON l.id = ua.label_id
        LEFT JOIN center_list c ON c.center_id = ua.center_id
        WHERE u.user_id IN (${placeholders})
      ) s ON s.user_id = fa.user_id
      JOIN marking_rules mr ON mr.master_activity_id = COALESCE(fa.master_activity_id, a.id)
      WHERE fa.user_id IN (${placeholders})
        AND COALESCE(fa.master_activity_id, a.id) IS NOT NULL
        AND COALESCE(fa.master_activity_id, a.id) > 0
        AND mr.status = 1
        AND mr.frequency = 'daily'
        AND (mr.scheme_id = s.scheme_id OR mr.scheme_id = 1)
      GROUP BY fa.user_id, COALESCE(fa.master_activity_id, a.id)
    ) sub
    GROUP BY sub.user_id`,
    [...ids, ...ids]
  );
  rows.forEach((r) => result.set(String(r.user_id), Number(r.daily_max) || 0));
  return result;
};

/** Percentage for display (whole number, 0-100) and the exact value used to rank (2 decimals, 0-100). */
export const percentageOf = (earned, possible) => {
  const e = Number(earned) || 0;
  const p = Number(possible) || 0;
  if (p <= 0 || e <= 0) return { percentage: 0, exact: 0 };
  const exact = Math.min(100, round2((e / p) * 100));
  return { percentage: Math.round(exact), exact };
};

/**
 * Sorts and ranks students.
 * Each item needs: total_marks, name (or student_name). Adds `percentage`, `max_marks` stays as given,
 * and `rank`. Items with no marks at all (nothing entered) go to the bottom and share the last rank.
 * @param {Array} items  [{ ..., total_marks, max_marks }]
 * @returns {Array} new sorted array with rank + percentage
 */
export const rankByPercentage = (items) => {
  const nameOf = (s) => String(s.name ?? s.student_name ?? "");
  const scored = (items || []).map((s) => {
    const { percentage, exact } = percentageOf(s.total_marks, s.max_marks);
    return { ...s, percentage, _exact: exact };
  });

  scored.sort((a, b) =>
    (b._exact - a._exact) ||
    (Number(b.total_marks) - Number(a.total_marks)) ||
    nameOf(a).localeCompare(nameOf(b))
  );

  let rank = 0;
  let prev = null;
  return scored.map((s, index) => {
    const same = prev && prev._exact === s._exact && Number(prev.total_marks) === Number(s.total_marks);
    if (!same) rank = index + 1;
    prev = s;
    const { _exact, ...rest } = s;
    return { ...rest, rank };
  });
};
