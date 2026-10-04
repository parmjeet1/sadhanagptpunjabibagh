import { asyncHandler, mergeParam } from "../../../utils/utils.js";
import db from "../../../config/database.js";

/**
 * "Add custom activity" pick-list for students AND counsellors (for their own
 * list only).
 *
 * The pick-list offers ONLY (1) the fixed set of standard activities below (the Daily
 * Sadhana Marking Scheme activities) and (2) custom activities made by the person's OWN
 * counsellor (a counsellor sees their own), never anything else, so it is never random.
 * Activities the person already has (same master activity, or the same name) are left
 * out, so what remains is what is missing from their dashboard.
 *
 * Adding an activity here only changes the person's OWN list. It never writes to
 * counselor_added_activities, so a personal pick never makes a group look as if
 * the whole group had the activity. Because the copy keeps its master_activity_id,
 * its marks follow the person's marking scheme like any assigned activity.
 */

// The only activities that can be picked, in the order they are listed.
// Names are matched ignoring upper/lower case, spaces and punctuation, so
// "Reading Misc. Books" and "reading misc books" are the same.
export const STANDARD_ACTIVITY_NAMES = [
  "Sleep Time",
  "wake up time",
  "Chanting Completion Time",
  "chanting",
  "Mangal Aarti Attended",
  "day rest(min)",
  "hearing(min)",
  "reading(min)",
  "Reading Misc. Books",
  "hearing spiritual master",
  "hearing srila prabhupada",
  "menial services",
  "Shloka Memorisation",
  "Study Hours(MIN)",
];

export const normalizeActivityName = (name) =>
  String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const ALLOWED_ORDER = new Map(STANDARD_ACTIVITY_NAMES.map((n, i) => [normalizeActivityName(n), i]));

// Active activities (1 = built-in, 3 = counsellor custom).
const CANDIDATE_STATUSES = [1, 3];

const betterRow = (x, cur) => {
  const rank = (r) => [Number(r.status ?? r.original_status) === 1 ? 0 : 1, Number(r.id ?? r.master_activity_id)];
  const [xa, xb] = rank(x);
  const [ca, cb] = rank(cur);
  return xa < ca || (xa === ca && xb < cb);
};

/**
 * Keeps what may be shown or added:
 *  - the fixed standard activities (one row per name; a built-in wins over a custom copy
 *    of the same name, then the lowest id), in the fixed order, then
 *  - custom activities (status 3) made by one of `counsellorIds` (the person's own
 *    counsellor, or themselves if they are a counsellor), one row per name, A to Z.
 * Everything else (other counsellors' customs, other built-ins) is dropped.
 * Exported for testing.
 */
export const filterStandardActivities = (rows, { counsellorIds = [] } = {}) => {
  const mine = new Set(counsellorIds.filter(v => v !== undefined && v !== null && v !== "").map(String));
  const standard = new Map();
  const customs = new Map();
  for (const r of rows || []) {
    const key = normalizeActivityName(r.name);
    if (!key) continue;
    const isCustom = Number(r.status ?? r.original_status) === 3;
    if (ALLOWED_ORDER.has(key)) {
      const cur = standard.get(key);
      if (!cur || betterRow(r, cur)) standard.set(key, r);
    } else if (isCustom && mine.has(String(r.counsellor_id))) {
      const cur = customs.get(key);
      if (!cur || betterRow(r, cur)) customs.set(key, r);
    }
  }
  const standardRows = [...standard.entries()]
    .sort((x, y) => ALLOWED_ORDER.get(x[0]) - ALLOWED_ORDER.get(y[0]))
    .map(([, r]) => r);
  const customRows = [...customs.values()]
    .sort((x, y) => String(x.name).localeCompare(String(y.name)));
  return [...standardRows, ...customRows];
};

/** Counsellors whose custom activities this person may pick: their primary counsellor and themselves. */
export const getPickCounsellorIds = async (userId) => {
  const ids = [userId];
  try {
    const [rows] = await db.query(
      `SELECT counsller_id FROM user_counsellors WHERE user_id = ? AND counsllor_type = 'primary'`,
      [userId]
    );
    rows.forEach(r => { if (r.counsller_id) ids.push(r.counsller_id); });
  } catch (error) {
    console.error("Error reading the person's counsellor:", error?.message || error);
  }
  return ids;
};

/** Builds the SQL + params for the candidates the person does not have yet. Exported for testing. */
export const buildAddableActivitiesQuery = ({ userId }) => {
  const query = `
    SELECT a.id AS master_activity_id, a.name, a.description, a.unit, a.target,
           a.activity_type, a.status AS original_status, a.counsellor_id
    FROM activities a
    WHERE a.status IN (${CANDIDATE_STATUSES.join(",")})
      AND NOT EXISTS (SELECT 1 FROM fix_activities f WHERE f.user_id = ? AND f.master_activity_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM fix_activities f2 WHERE f2.user_id = ? AND LOWER(TRIM(f2.name)) = LOWER(TRIM(a.name)))`;
  return { query, params: [userId, userId] };
};

// GET /addable-activities
export const getAddableActivities = asyncHandler(async (req, resp) => {
  try {
    // apiAuthentication already put the token's user_id here.
    const userId = req.user?.user_id || mergeParam(req).user_id;
    if (!userId) {
      return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
    }
    const { search_text = "" } = mergeParam(req);
    const { query, params } = buildAddableActivitiesQuery({ userId });
    const [candidates] = await db.query(query, params);
    const text = String(search_text || "").trim().toLowerCase();
    const counsellorIds = await getPickCounsellorIds(userId);
    const rows = filterStandardActivities(candidates, { counsellorIds }).filter(r =>
      !text || `${r.name} ${r.description || ""}`.toLowerCase().includes(text)
    );

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
    const [found] = await db.query(
      `SELECT a.id, a.name, a.description, a.unit, a.target, a.activity_type, a.status, a.counsellor_id
       FROM activities a
       WHERE a.id IN (${placeholders})
         AND a.status IN (${CANDIDATE_STATUSES.join(",")})
         AND NOT EXISTS (SELECT 1 FROM fix_activities f WHERE f.user_id = ? AND f.master_activity_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM fix_activities f2 WHERE f2.user_id = ? AND LOWER(TRIM(f2.name)) = LOWER(TRIM(a.name)))`,
      [...ids, userId, userId]
    );
    // Only the standard activities and the person's own counsellor's customs can be added,
    // whatever ids are sent.
    const counsellorIds = await getPickCounsellorIds(userId);
    const candidates = filterStandardActivities(found, { counsellorIds });

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
