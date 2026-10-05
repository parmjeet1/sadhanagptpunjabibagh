import db from "../../../config/database.js";
import { asyncHandler, mergeParam } from "../../../utils/utils.js";
import {
  getSchemesList,
  createMarkingScheme,
  getSchemeActivitiesList,
  getMarkingRules,
  saveMarkingSchemeBatch,
  deleteMarkingScheme,
  deleteMarkingRule,
  deleteActivityRules,
} from "./MarkingController.js";
import { getEffectiveScheme, isPersonalSchemeReady } from "./effectiveScheme.js";
import { recalculateTodayMarksInBackground } from "./recalculateMarks.js";

/**
 * "My own marking scheme" for ANY logged-in person (student or counsellor).
 *
 * A person's own schemes are stored exactly like a counsellor's schemes (marking_schemes with the
 * person as owner, rules in marking_rules); users.personal_marking_scheme_id says which one they use
 * for themselves. A counsellor's group / sub-group scheme overrides it (see effectiveScheme.js).
 *
 * Every route here takes the owner from the login token and never from the request, and checks that
 * a scheme / rule belongs to that person before touching it, so nobody can read-write another
 * person's scheme through these routes.
 */

const deny = (resp, message, code = 403) => resp.json({ status: 0, code, message: [message] });

/** Forces the owner (counsellor_id) of the request to the logged-in person. */
const forceOwner = (req, userId) => {
  req.body = { ...(req.body || {}), counsellor_id: userId };
  if (req.query && typeof req.query === "object") req.query.counsellor_id = userId;
};

/** Does this scheme belong to the person? */
const ownsScheme = async (userId, schemeId) => {
  if (!schemeId) return false;
  const [rows] = await db.query("SELECT id FROM marking_schemes WHERE id = ? AND counsellor_id = ?", [schemeId, userId]);
  return rows.length > 0;
};

const ownerOf = (req) => req.user?.user_id;

// GET-like: the person's own schemes + the default scheme (with which one they use for themselves)
export const mySchemeList = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  forceOwner(req, uid);
  return getSchemesList(req, resp, next);
});

export const mySchemeActivities = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  forceOwner(req, uid);
  return getSchemeActivitiesList(req, resp, next);
});

// Rules of the default scheme or of one of the person's own schemes.
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

export const myCreateScheme = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  forceOwner(req, uid);
  req.body.assignments = []; // a personal scheme is never allotted to groups
  return createMarkingScheme(req, resp, next);
});

export const mySaveScheme = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  const { scheme_id } = mergeParam(req);
  // An existing scheme must be the person's own; an id that does not exist yet creates a new own scheme.
  if (scheme_id && Number(scheme_id) < 1000000000) {
    const [[existing]] = await db.query("SELECT counsellor_id FROM marking_schemes WHERE id = ?", [scheme_id]);
    if (existing && String(existing.counsellor_id) !== String(uid)) {
      return deny(resp, "Scheme not found or access denied.");
    }
  }
  forceOwner(req, uid);
  return saveMarkingSchemeBatch(req, resp, next);
});

export const myDeleteScheme = asyncHandler(async (req, resp, next) => {
  const uid = ownerOf(req);
  if (!uid) return deny(resp, "Please log in again.", 401);
  forceOwner(req, uid); // deleteMarkingScheme itself checks the owner
  return deleteMarkingScheme(req, resp, next);
});

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
 * POST /use-my-marking-scheme   body: { scheme_id }  (null / 0 / "" = stop using my own scheme)
 * Works for students and counsellors. Today's entries are recalculated in the background.
 */
export const useMyMarkingScheme = asyncHandler(async (req, resp) => {
  try {
    const uid = ownerOf(req);
    if (!uid) return deny(resp, "Please log in again.", 401);

    if (!(await isPersonalSchemeReady())) {
      return resp.json({ status: 0, code: 503, message: ["Own marking scheme is not switched on yet. Please try again shortly."] });
    }

    const raw = mergeParam(req).scheme_id;
    const schemeId = raw === undefined || raw === null || raw === "" || Number(raw) === 0 ? null : Number(raw);

    if (schemeId !== null && !(await ownsScheme(uid, schemeId))) {
      return deny(resp, "You can only use a scheme you made yourself.");
    }

    await db.query("UPDATE users SET personal_marking_scheme_id = ? WHERE user_id = ?", [schemeId, uid]);
    recalculateTodayMarksInBackground({ userIds: [uid] });

    const effective = await getEffectiveScheme(uid);
    const overridden = schemeId !== null && (effective.source === "group" || effective.source === "subgroup");
    return resp.json({
      status: 1,
      code: 200,
      message: [
        schemeId === null
          ? "You are no longer using your own marking scheme."
          : overridden
            ? "Saved. Your counsellor's group scheme is in use for now; yours applies if it is removed."
            : "Your own marking scheme is now in use."
      ],
      data: { personal_scheme_id: schemeId, applied_scheme_id: effective.schemeId, applied_source: effective.source, overridden }
    });
  } catch (error) {
    console.error("Error setting own marking scheme:", error);
    return resp.json({ status: 0, code: 500, message: ["Error saving your marking scheme choice."] });
  }
});
