import { asyncHandler, mergeParam } from "../../../utils/utils.js";
import db from "../../../config/database.js";

/**
 * "Add custom activity" pick-list for students AND counsellors (for their own
 * list only).
 *
 * The pool is shared: every built-in activity (activities.status = 1) plus every
 * counsellor's custom activity (status = 3). Activities the person already has
 * (same master activity, or the same name) are left out.
 *
 * Adding an activity here only changes the person's OWN list. It never writes to
 * counselor_added_activities, so a personal pick never makes a group look as if
 * the whole group had the activity. Because the copy keeps its master_activity_id,
 * its marks follow the person's marking scheme like any assigned activity.
 */

// Activities visible in the shared pool (0 = inactive / deleted).
const POOL_STATUSES = [1, 3];

/** Builds the SQL + params for the pick-list. Exported for testing. */
export const buildAddableActivitiesQuery = ({ userId, searchText = "", limit = 100 }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const params = [userId, userId];
  let search = "";
  const text = String(searchText || "").trim();
  if (text) {
    search = "AND (a.name LIKE ? OR a.description LIKE ?)";
    params.push(`%${text}%`, `%${text}%`);
  }
  const query = `
    SELECT a.id AS master_activity_id, a.name, a.description, a.unit, a.target,
           a.activity_type, a.status AS original_status, a.counsellor_id
    FROM activities a
    WHERE a.status IN (${POOL_STATUSES.join(",")})
      AND NOT EXISTS (SELECT 1 FROM fix_activities f WHERE f.user_id = ? AND f.master_activity_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM fix_activities f2 WHERE f2.user_id = ? AND LOWER(TRIM(f2.name)) = LOWER(TRIM(a.name)))
      ${search}
    ORDER BY (a.status = 1) DESC, a.name ASC
    LIMIT ${safeLimit}`;
  return { query, params };
};

// GET /addable-activities
export const getAddableActivities = asyncHandler(async (req, resp) => {
  try {
    // apiAuthentication already put the token's user_id here.
    const userId = req.user?.user_id || mergeParam(req).user_id;
    if (!userId) {
      return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
    }
    const { search_text = "", limit = 100 } = mergeParam(req);
    const { query, params } = buildAddableActivitiesQuery({ userId, searchText: search_text, limit });
    const [rows] = await db.query(query, params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Activities fetched successfully!"],
      data: rows.map(r => ({ ...r, is_built_in: Number(r.original_status) === 1 })),
    });
  } catch (error) {
    console.error("Error fetching addable activities:", error);
    return resp.json({ status: 0, code: 500, message: ["Error fetching activities."] });
  }
});

// POST /add-selected-activities   body: { master_activity_ids: [..] }
export const addSelectedActivities = asyncHandler(async (req, resp) => {
  try {
    const userId = req.user?.user_id || mergeParam(req).user_id;
    if (!userId) {
      return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
    }

    let ids = mergeParam(req).master_activity_ids;
    if (typeof ids === "string") {
      try { ids = JSON.parse(ids); } catch { ids = ids.split(","); }
    }
    if (!Array.isArray(ids)) ids = ids === undefined || ids === null || ids === "" ? [] : [ids];
    ids = [...new Set(ids.map(v => parseInt(v, 10)).filter(v => Number.isInteger(v) && v > 0))];
    if (ids.length === 0) {
      return resp.json({ status: 0, code: 422, message: ["Please select at least one activity."] });
    }

    // (counsellor_id is left out on purpose, exactly like the built-in activities every
    // student gets at registration; marks use master_activity_id, not counsellor_id.)
    // Re-check against the pool and the person's current list, so repeated taps or a
    // stale screen can never create duplicates.
    const placeholders = ids.map(() => "?").join(",");
    const [candidates] = await db.query(
      `SELECT a.id, a.name, a.description, a.unit, a.target, a.activity_type, a.counsellor_id
       FROM activities a
       WHERE a.id IN (${placeholders})
         AND a.status IN (${POOL_STATUSES.join(",")})
         AND NOT EXISTS (SELECT 1 FROM fix_activities f WHERE f.user_id = ? AND f.master_activity_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM fix_activities f2 WHERE f2.user_id = ? AND LOWER(TRIM(f2.name)) = LOWER(TRIM(a.name)))`,
      [...ids, userId, userId]
    );

    if (candidates.length === 0) {
      return resp.json({
        status: 1,
        code: 200,
        message: ["These activities are already in your list."],
        data: { added: 0, skipped: ids.length },
      });
    }

    const values = candidates.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const flat = [];
    candidates.forEach(a => {
      flat.push(a.id, a.name, a.description, a.unit, a.activity_type, a.target, 0, userId);
    });
    await db.query(
      `INSERT INTO fix_activities
         (master_activity_id, name, description, unit, activity_type, target, own_by, user_id)
       VALUES ${values}`,
      flat
    );

    return resp.json({
      status: 1,
      code: 200,
      message: [candidates.length === 1 ? "Activity added!" : `${candidates.length} activities added!`],
      data: { added: candidates.length, skipped: ids.length - candidates.length },
    });
  } catch (error) {
    console.error("Error adding selected activities:", error);
    return resp.json({ status: 0, code: 500, message: ["Error adding activities."] });
  }
});
