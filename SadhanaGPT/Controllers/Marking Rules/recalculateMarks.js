import moment from "moment";
import db from "../../../config/database.js";
import { calculateBestMarks, selectRulesForScheme } from "../../Student/Controllers/StudentController.js";
import { resolveEffectiveSchemeId, getSchemeInputs, isPersonalSchemeReady } from "./effectiveScheme.js";
import { dailyStudentSummary } from "../SummaryData/summary-report.js";

/**
 * When a marking scheme is allotted (or changed / removed) for a group or
 * sub-group, TODAY's already-saved entries of the affected students are
 * recalculated with the scheme that now applies to each student, so the new
 * scheme counts straight away. Earlier days are never touched.
 *
 * Scheme resolution is the shared resolveEffectiveSchemeId() rule (custom sub-group scheme,
 * else group scheme, else default 1). Rules come from that scheme only; the default
 * scheme is used just for activities the scheme has no rule for.
 *
 * Never throws: a failure here must not break saving the scheme itself.
 *
 * @param {{ centerIds?: Array<number|string>, labelIds?: Array<number|string>, userIds?: Array<string> }} targets (userIds = people picked directly, e.g. when someone sets their own scheme)
 * @returns {Promise<{ students: number, entries: number }>}
 */
export const recalculateTodayMarks = async ({ centerIds = [], labelIds = [], userIds = [] } = {}) => {
  const result = { students: 0, entries: 0 };
  try {
    const centers = [...new Set(centerIds.filter(v => v !== undefined && v !== null && v !== ""))];
    const labels = [...new Set(labelIds.filter(v => v !== undefined && v !== null && v !== ""))];
    const people = [...new Set(userIds.filter(v => v !== undefined && v !== null && v !== "").map(String))];
    if (centers.length === 0 && labels.length === 0 && people.length === 0) return result;

    // Students whose CURRENT assignment is in one of the affected groups / sub-groups.
    let students = [];
    const conds = [];
    const params = [];
    if (centers.length) { conds.push(`ua.center_id IN (${centers.map(() => "?").join(",")})`); params.push(...centers); }
    if (labels.length) { conds.push(`ua.label_id IN (${labels.map(() => "?").join(",")})`); params.push(...labels); }
    if (conds.length) {
      [students] = await db.query(
        `SELECT DISTINCT ua.user_id
         FROM user_assignments ua
         WHERE (${conds.join(" OR ")})
           AND ua.id = (SELECT MAX(ua2.id) FROM user_assignments ua2 WHERE ua2.user_id = ua.user_id)`,
        params
      );
    }
    // People named directly (their own scheme changed).
    const known = new Set(students.map(r => String(r.user_id)));
    people.forEach(id => { if (!known.has(id)) students.push({ user_id: id }); });

    const today = moment().utcOffset("+05:30").format("YYYY-MM-DD");
    const rulesCache = new Map();

    for (const { user_id } of students) {
      const assignment = await getSchemeInputs(user_id);
      const schemeId = resolveEffectiveSchemeId(assignment?.label_scheme_id, assignment?.center_scheme_id, assignment?.personal_scheme_id);

      const [entries] = await db.query(
        `SELECT dr.activity_id, dr.count, fa.master_activity_id, fa.activity_type, fa.unit, fa.name
         FROM daily_report dr
         JOIN fix_activities fa ON fa.activity_id = dr.activity_id AND fa.user_id = dr.user_id
         WHERE dr.user_id = ? AND DATE(dr.activity_date) = ?`,
        [user_id, today]
      );
      if (entries.length === 0) continue;

      let changed = false;
      for (const e of entries) {
        if (!e.master_activity_id || Number(e.master_activity_id) <= 0) continue;

        const cacheKey = `${schemeId}:${e.master_activity_id}`;
        let rules = rulesCache.get(cacheKey);
        if (!rules) {
          const [fetched] = await db.query(
            `SELECT condition_operator, condition_value, marks, scheme_id, frequency
             FROM marking_rules
             WHERE scheme_id IN (?, 1) AND master_activity_id = ? AND status = 1 AND frequency = 'daily'`,
            [schemeId, e.master_activity_id]
          );
          rules = selectRulesForScheme(fetched, schemeId);
          rulesCache.set(cacheKey, rules);
        }

        // Same outcome as saveActivityEntry(): no rules -> 0, no matching rule -> null.
        const marks = rules.length > 0
          ? calculateBestMarks(e.count, rules, e.activity_type, e.unit, e.name)
          : 0;

        await db.query(
          `UPDATE daily_report SET marks = ? WHERE activity_id = ? AND user_id = ? AND DATE(activity_date) = ?`,
          [marks, e.activity_id, user_id, today]
        );
        result.entries++;
        changed = true;
      }

      if (changed) {
        result.students++;
        await dailyStudentSummary(user_id, today).catch(err =>
          console.error("recalculateTodayMarks: summary update failed for user", user_id, err?.message)
        );
      }
    }
  } catch (err) {
    console.error("recalculateTodayMarks failed:", err?.message || err);
  }
  return result;
};

/** Groups, sub-groups and people (own scheme) that currently use the given scheme. */
export const getTargetsUsingScheme = async (schemeId) => {
  const [centers] = await db.query("SELECT center_id FROM center_list WHERE marking_scheme_id = ?", [schemeId]);
  const [labels] = await db.query("SELECT id FROM labels_list WHERE marking_scheme_id = ?", [schemeId]);
  let userIds = [];
  if (await isPersonalSchemeReady()) {
    const [people] = await db.query("SELECT user_id FROM users WHERE personal_marking_scheme_id = ?", [schemeId]);
    userIds = people.map(p => p.user_id);
  }
  return { centerIds: centers.map(c => c.center_id), labelIds: labels.map(l => l.id), userIds };
};

/** Turns the {type:'group'|'subgroup', id} list the UI sends into recalculation targets. */
export const targetsFromAssignments = (assignList = []) => ({
  centerIds: assignList.filter(a => a.type === "group").map(a => a.id),
  labelIds: assignList.filter(a => a.type === "subgroup").map(a => a.id),
});

export const mergeTargets = (...list) => ({
  centerIds: list.flatMap(t => t?.centerIds || []),
  labelIds: list.flatMap(t => t?.labelIds || []),
  userIds: list.flatMap(t => t?.userIds || []),
});

/**
 * Runs the recalculation but only makes the caller wait a short while, so saving
 * a scheme for a very large group never hangs or times out. If it takes longer
 * the work simply carries on in the background.
 */
export const recalculateTodayMarksSoon = async (targets, waitMs = 8000) => {
  const work = recalculateTodayMarks(targets);
  let timer;
  const limit = new Promise(resolve => { timer = setTimeout(() => resolve(null), waitMs); });
  const done = await Promise.race([work, limit]);
  clearTimeout(timer);
  return done;
};

/**
 * Runs the recalculation in the BACKGROUND and returns at once. Used after a scheme is saved,
 * created, changed or deleted: the scheme itself is already stored, so nothing in the
 * recalculation (a slow query, a failure, finding the affected groups) may delay the answer
 * or turn a successful save into a "failed" message. Failures are only logged.
 * @param {object|(() => Promise<object>)} targets  the targets, or a function that finds them
 */
export const recalculateTodayMarksInBackground = (targets) => {
  Promise.resolve()
    .then(async () => recalculateTodayMarks(typeof targets === "function" ? await targets() : targets))
    .catch(err => console.error("Background marks recalculation failed:", err?.message || err));
};
