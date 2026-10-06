import db from "../../../config/database.js";
import { asyncHandler, mergeParam } from "../../../utils/utils.js";
import {
  getSchemeActivitiesList,
  getMarkingRules,
  saveMarkingSchemeBatch,
  deleteMarkingRule,
  deleteActivityRules,
} from "./MarkingController.js";
import {
  getEffectiveScheme,
  getPersonalScheme,
  ensurePersonalScheme,
} from "./effectiveScheme.js";
import { recalculateTodayMarksInBackground } from "./recalculateMarks.js";

/**
 * "My Marking Scheme" for ANY logged-in person (student or counsellor).
 *
 * NO DATABASE CHANGE (see effectiveScheme.js): the person's own scheme is one row of
 * marking_schemes named "<user_id> My Marking Scheme" (owner = the person), its rules are normal
 * marking_rules, and is_enabled says whether the person uses it (1) or the default / their
 * counsellor's scheme (0). The person can edit the rules, never the name.
 *
 * Every route takes the owner from the login token and never from the request, so nobody can
 * read or change another person's scheme through these routes. A counsellor's group / sub-group
 * scheme always overrides the own scheme (it stays saved and applies again if the allotment goes).
 */

const deny = (resp, message, code = 403) => resp.json({ status: 0, code, message: [message] });
const ownerOf = (req) => req.user?.user_id;

/** Forces the owner (counsellor_id) of the request to the logged-in person. */
const forceOwner = (req, userId) => {
  req.body = { ...(req.body || {}), counsellor_id: userId };
  if (req.query && typeof req.query === "object") req.query.counsellor_id = userId;
};

const truthy = (v) => v === true || v === 1 || v === "1" || v === "true";

const RULES_SQL = `
  SELECT mr.id AS rule_id, mr.scheme_id, mr.master_activity_id,
         a.name AS activity_name, a.unit AS activity_unit, a.activity_type,
         mr.frequency, mr.condition_operator, mr.condition_value, mr.marks, mr.is_max_marks
  FROM marking_rules mr
  JOIN activities a ON a.id = mr.master_activity_id
  WHERE mr.scheme_id = ? AND mr.status = 1
  ORDER BY mr.master_activity_id ASC, mr.marks DESC`;

const describe = (effective, personal) => {
  const uses = !!personal?.enabled;
  return {
    scheme: personal ? { id: personal.id, name: personal.name, enabled: personal.enabled } : null,
    using_own: uses && effective.source === "personal",
    overridden: uses && (effective.source === "group" || effective.source === "subgroup"),
    applied_scheme_id: effective.schemeId,
    applied_source: effective.source,
  };
};

// POST /my-marking-scheme  -> my own scheme (if I made one), whether I use it, and what applies to me now
export const getMyMarkingScheme = asyncHandler(async (req, resp) => {
  try {
    const uid = ownerOf(req);
    if (!uid) return deny(resp, "Please log in again.", 401);
    const [personal, effective] = await Promise.all([getPersonalScheme(uid), getEffectiveScheme(uid)]);
    let rules = [];
    if (personal) [rules] = await db.query(RULES_SQL, [personal.id]);

    // When a counsellor's group / sub-group scheme applies to me, send it too (read-only for the student),
    // with the name and email of the counsellor who made it, so the student knows whom to ask for changes.
    // Only the scheme that applies to this very person is sent, picked on the server.
    let counsellor_scheme = null;
    if (effective.source === "group" || effective.source === "subgroup") {
      const [[row]] = await db.query("SELECT id, name, counsellor_id FROM marking_schemes WHERE id = ?", [effective.schemeId]);
      if (row) {
        const [schemeRules] = await db.query(RULES_SQL, [row.id]);
        let counsellor = null;
        const [[owner]] = await db.query("SELECT name, email FROM users WHERE user_id = ? LIMIT 1", [String(row.counsellor_id)]);
        if (owner) counsellor = { name: owner.name || null, email: owner.email || null };
        counsellor_scheme = { id: Number(row.id), name: row.name, level: effective.source, counsellor, rules: schemeRules };
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["My marking scheme fetched successfully!"],
      data: { ...describe(effective, personal), rules, counsellor_scheme },
    });
  } catch (error) {
    console.error("Error fetching my marking scheme:", error);
    return resp.json({ status: 0, code: 500, message: ["Error fetching my marking scheme."] });
  }
});

// POST /my-scheme-activities  -> the activities the person can write rules for
export const mySchemeActivities = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  forceOwner(req, uid);
  return getSchemeActivitiesList(req, resp, next);
});

// POST /my-marking-rules  { scheme_id } -> rules of the default scheme or of my own scheme
export const myMarkingRules = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  const { scheme_id } = mergeParam(req);
  const [[scheme]] = await db.query("SELECT counsellor_id FROM marking_schemes WHERE id = ?", [scheme_id || 0]);
  if (!scheme || (scheme.counsellor_id !== "system" && String(scheme.counsellor_id) !== String(uid))) {
    return deny(resp, "Scheme not found or access denied.");
  }
  return getMarkingRules(req, resp, next);
});

/**
 * POST /my-save-scheme  { activities: [...], use_for_self?: true }
 * Saves the rules of MY scheme (created on first save, switched off unless use_for_self is true).
 * The scheme id and name always come from the server.
 */
export const mySaveScheme = asyncHandler(async (req, resp, next) => {
  try {
    const uid = ownerOf(req);
    if (!uid) return deny(resp, "Please log in again.", 401);

    const wantsUse = truthy(mergeParam(req).use_for_self);
    const personal = await ensurePersonalScheme(uid, wantsUse);
    if (wantsUse && !personal.enabled) {
      await db.query("UPDATE marking_schemes SET is_enabled = 1 WHERE id = ? AND counsellor_id = ?", [personal.id, String(uid)]);
      personal.enabled = true;
    }

    forceOwner(req, uid);
    req.body.scheme_id = personal.id;
    req.body.name = personal.name;
    if (req.query && typeof req.query === "object") { req.query.scheme_id = personal.id; req.query.name = personal.name; }
    req._personalFlow = true;

    // The rules are saved before the answer is sent; then today's entries follow them (background).
    resp.once("finish", () => {
      if (resp.statusCode < 400 && personal.enabled) recalculateTodayMarksInBackground({ userIds: [uid] });
    });
    return saveMarkingSchemeBatch(req, resp, next);
  } catch (error) {
    console.error("Error saving my marking scheme:", error);
    return resp.json({ status: 0, code: 500, message: ["Error saving my marking scheme."] });
  }
});

const ownsScheme = async (userId, schemeId) => {
  if (!schemeId) return false;
  const [rows] = await db.query("SELECT id FROM marking_schemes WHERE id = ? AND counsellor_id = ?", [schemeId, String(userId)]);
  return rows.length > 0;
};

export const myDeleteRule = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  const { rule_id } = mergeParam(req);
  const [[rule]] = await db.query(
    `SELECT ms.counsellor_id FROM marking_rules mr JOIN marking_schemes ms ON ms.id = mr.scheme_id WHERE mr.id = ?`,
    [rule_id || 0]
  );
  if (!rule || String(rule.counsellor_id) !== String(uid)) return deny(resp, "Rule not found or access denied.");
  forceOwner(req, uid);
  return deleteMarkingRule(req, resp, next);
});

export const myDeleteActivityRules = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  const { scheme_id } = mergeParam(req);
  if (!(await ownsScheme(uid, scheme_id))) return deny(resp, "Scheme not found or access denied.");
  forceOwner(req, uid);
  return deleteActivityRules(req, resp, next);
});

/**
 * POST /use-my-marking-scheme   body: { use: true | false }
 * true = use my own scheme, false = use the default (or my counsellor's scheme, which always wins).
 * Today's entries are recalculated in the background; earlier days keep their marks.
 */
export const useMyMarkingScheme = asyncHandler(async (req, resp) => {
  try {
    const uid = ownerOf(req);
    if (!uid) return deny(resp, "Please log in again.", 401);

    const use = truthy(mergeParam(req).use);
    let personal = await getPersonalScheme(uid);
    if (use) {
      personal = personal || (await ensurePersonalScheme(uid, true));
      await db.query("UPDATE marking_schemes SET is_enabled = 1 WHERE id = ? AND counsellor_id = ?", [personal.id, String(uid)]);
      personal.enabled = true;
    } else if (personal) {
      await db.query("UPDATE marking_schemes SET is_enabled = 0 WHERE id = ? AND counsellor_id = ?", [personal.id, String(uid)]);
      personal.enabled = false;
    }

    recalculateTodayMarksInBackground({ userIds: [uid] });

    const effective = await getEffectiveScheme(uid);
    const info = describe(effective, personal);
    return resp.json({
      status: 1,
      code: 200,
      message: [
        !use
          ? "You are using the default marking scheme."
          : info.overridden
            ? "Saved. Your counsellor's scheme is in use for now; yours applies if it is removed."
            : "Your own marking scheme is now in use."
      ],
      data: info,
    });
  } catch (error) {
    console.error("Error switching my marking scheme:", error);
    return resp.json({ status: 0, code: 500, message: ["Error saving your marking scheme choice."] });
  }
});

/**
 * POST /student-own-scheme   { student_id }   (counsellors only)
 * Read-only view of a student's own scheme. Only for students of this counsellor.
 */
export const getStudentOwnScheme = asyncHandler(async (req, resp) => {
  try {
    const counsellorId = ownerOf(req);
    if (!counsellorId) return deny(resp, "Please log in again.", 401);
    const { student_id } = mergeParam(req);
    if (!student_id) return resp.json({ status: 0, code: 422, message: ["student_id is required"] });

    const [[link]] = await db.query(
      `SELECT 1 AS ok FROM (
         SELECT user_id FROM user_assignments WHERE user_id = ? AND counsellor_id = ?
         UNION
         SELECT user_id FROM user_counsellors WHERE user_id = ? AND counsller_id = ?
       ) t LIMIT 1`,
      [student_id, counsellorId, student_id, counsellorId]
    );
    if (!link) return deny(resp, "Student not found or access denied.");

    const [personal, effective] = await Promise.all([getPersonalScheme(student_id), getEffectiveScheme(student_id)]);
    let rules = [];
    if (personal) [rules] = await db.query(RULES_SQL, [personal.id]);
    return resp.json({
      status: 1,
      code: 200,
      message: ["Student's own marking scheme fetched successfully!"],
      data: { student_id, has_own_scheme: !!personal, ...describe(effective, personal), rules },
    });
  } catch (error) {
    console.error("Error fetching student's own scheme:", error);
    return resp.json({ status: 0, code: 500, message: ["Error fetching the student's own marking scheme."] });
  }
});
