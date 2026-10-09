// LECTURES - endpoints for the logged-in person (student OR counsellor: their own log).
// Same style as ReadingStudentController.js: a factory that receives the database (so it can be
// tested against a throwaway database); real wiring is in ./index.js. The person always comes
// from the login token. Needs the tables in DB-PROPOSAL.sql.

import { cleanText, cleanLink, todayIST, cleanHeardOn } from "./readingRules.js";
import { resolvePlan } from "./ReadingStudentController.js";

const NEW_BADGE_DAYS = 14;
const DEFAULT_SPEAKER = "Srila Prabhupada";

const fail = (resp, code, message, extra = {}) => resp.json({ status: 0, code, message: [message], ...extra });
const ok = (resp, message, data = {}) => resp.json({ status: 1, code: 200, message: [message], data });
const params = (req) => ({ ...(req.query || {}), ...(req.body || {}) });
const meOf = (req) => req.user?.user_id;

const LOG_FIELDS = `l.id AS log_id, l.lecture_id, l.title, l.speaker, l.link, DATE_FORMAT(l.heard_on, '%Y-%m-%d') AS heard_on`;

export const createLectureHandlers = (db, { now = () => Date.now() } = {}) => {
  const guard = (fn) => async (req, resp) => {
    try {
      if (!meOf(req)) return fail(resp, 401, "Please log in again.");
      return await fn(req, resp, meOf(req));
    } catch (error) {
      console.error("[lectures] error:", error);
      return fail(resp, 500, "Something went wrong. Please try again.");
    }
  };

  const logShape = (r) => ({
    log_id: Number(r.log_id),
    lecture_id: r.lecture_id === null || r.lecture_id === undefined ? null : Number(r.lecture_id),
    title: r.title,
    speaker: r.speaker,
    link: r.link,
    heard_on: r.heard_on,
    is_custom: r.lecture_id === null || r.lecture_id === undefined,
  });

  /** GET /lectures/plan - the recommended lectures this person sees (ticked if heard) + his own log. */
  const getLecturePlan = guard(async (req, resp, me) => {
    const plan = await resolvePlan(db, me, "lecture");
    if (!plan) return fail(resp, 404, "Lecture list is not set up yet.");

    const [items] = await db.query(
      `SELECT lec.id AS lecture_id, lec.title, lec.title_hi, lec.speaker, lec.link, lec.topic,
              (li.created_at >= NOW() - INTERVAL ${NEW_BADGE_DAYS} DAY) AS recent,
              l.id AS log_id, DATE_FORMAT(l.heard_on, '%Y-%m-%d') AS heard_on
       FROM lecture_plan_items li
       JOIN lectures lec ON lec.id = li.lecture_id AND lec.is_active = 1
       LEFT JOIN user_lecture_log l ON l.lecture_id = lec.id AND l.user_id = ?
       WHERE li.plan_id = ?
       ORDER BY li.sort_order, li.id`,
      [me, plan.id]
    );
    const [log] = await db.query(
      `SELECT ${LOG_FIELDS} FROM user_lecture_log l WHERE l.user_id = ? ORDER BY l.heard_on DESC, l.id DESC`,
      [me]
    );

    const lectures = items.map((r) => {
      const heard = r.log_id !== null && r.log_id !== undefined;
      return {
        lecture_id: Number(r.lecture_id),
        title: r.title,
        title_hi: r.title_hi,
        speaker: r.speaker,
        link: r.link,
        topic: r.topic,
        heard,
        heard_on: heard ? r.heard_on : null,
        // NEW badge only for lists a counsellor edited (never the system list), and only until heard
        is_new: !heard && plan.scope !== "default" && Number(r.recent) === 1,
      };
    });
    return ok(resp, "Lecture list fetched successfully!", {
      plan: { plan_id: Number(plan.id), scope: plan.scope, is_default: plan.scope === "default" },
      lectures,
      log: log.map(logShape),
      summary: { recommended: lectures.length, heard: lectures.filter((l) => l.heard).length, total_heard: log.length },
    });
  });

  /** POST /lectures/mark-heard  { lecture_id, heard_on? } - ticks a recommended lecture */
  const markHeard = guard(async (req, resp, me) => {
    const p = params(req);
    const lectureId = Number(p.lecture_id);
    if (!Number.isInteger(lectureId) || lectureId <= 0) return fail(resp, 422, "lecture_id is required");
    const heardOn = cleanHeardOn(p.heard_on, todayIST(now()));
    if (heardOn === undefined) return fail(resp, 422, "heard_on must look like 2026-10-09 and cannot be in the future");

    const [[lec]] = await db.query(`SELECT id, title, speaker, link FROM lectures WHERE id = ? AND is_active = 1`, [lectureId]);
    if (!lec) return fail(resp, 404, "Lecture not found.");
    const [[already]] = await db.query(`SELECT id FROM user_lecture_log WHERE user_id = ? AND lecture_id = ?`, [me, lectureId]);
    if (!already) {
      const plan = await resolvePlan(db, me, "lecture");
      const [[inPlan]] = plan
        ? await db.query(`SELECT 1 AS ok FROM lecture_plan_items WHERE plan_id = ? AND lecture_id = ? LIMIT 1`, [plan.id, lectureId])
        : [[null]];
      if (!inPlan) return fail(resp, 403, "This lecture is not in your list.");
    }
    // title / speaker / link are copied so the log still reads correctly if the list changes later
    await db.query(
      `INSERT INTO user_lecture_log (user_id, lecture_id, title, speaker, link, heard_on) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE heard_on = VALUES(heard_on)`,
      [me, lectureId, lec.title, lec.speaker, lec.link, heardOn]
    );
    return ok(resp, "Lecture marked as heard.", { lecture_id: lectureId, heard: true, heard_on: heardOn });
  });

  /** POST /lectures/unmark-heard  { lecture_id } - un-ticks a recommended lecture */
  const unmarkHeard = guard(async (req, resp, me) => {
    const lectureId = Number(params(req).lecture_id);
    if (!Number.isInteger(lectureId) || lectureId <= 0) return fail(resp, 422, "lecture_id is required");
    await db.query(`DELETE FROM user_lecture_log WHERE user_id = ? AND lecture_id = ?`, [me, lectureId]);
    return ok(resp, "Lecture un-marked.", { lecture_id: lectureId, heard: false });
  });

  /** POST /lectures/add-my-lecture  { title, speaker?, link?, heard_on? } - a lecture the person typed in himself */
  const addMyLecture = guard(async (req, resp, me) => {
    const p = params(req);
    const title = cleanText(p.title, 255);
    if (!title) return fail(resp, 422, title === undefined ? "Title is too long (255 letters at most)." : "Title is required");
    const speaker = p.speaker === undefined || p.speaker === null || String(p.speaker).trim() === "" ? DEFAULT_SPEAKER : cleanText(p.speaker, 150);
    if (!speaker) return fail(resp, 422, "Speaker is too long (150 letters at most).");
    const link = cleanLink(p.link);
    if (link === undefined) return fail(resp, 422, "Link must start with http:// or https://");
    const heardOn = cleanHeardOn(p.heard_on, todayIST(now()));
    if (heardOn === undefined) return fail(resp, 422, "heard_on must look like 2026-10-09 and cannot be in the future");

    const [[dup]] = await db.query(
      `SELECT id FROM user_lecture_log
       WHERE user_id = ? AND lecture_id IS NULL AND LOWER(title) = LOWER(?) AND COALESCE(link, '') = COALESCE(?, '') LIMIT 1`,
      [me, title, link]
    );
    if (dup) return fail(resp, 409, "This lecture is already in your list.", { data: { log_id: Number(dup.id) } });

    const [ins] = await db.query(
      `INSERT INTO user_lecture_log (user_id, lecture_id, title, speaker, link, heard_on) VALUES (?, NULL, ?, ?, ?, ?)`,
      [me, title, speaker, link, heardOn]
    );
    return ok(resp, "Lecture added to your list.", {
      log_id: Number(ins.insertId), lecture_id: null, title, speaker, link, heard_on: heardOn, is_custom: true,
    });
  });

  /** POST /lectures/remove-my-lecture  { log_id } - deletes a lecture the person typed in himself */
  const removeMyLecture = guard(async (req, resp, me) => {
    const logId = Number(params(req).log_id);
    if (!Number.isInteger(logId) || logId <= 0) return fail(resp, 422, "log_id is required");
    const [r] = await db.query(`DELETE FROM user_lecture_log WHERE id = ? AND user_id = ? AND lecture_id IS NULL`, [logId, me]);
    if (!r.affectedRows) return fail(resp, 404, "Lecture not found in your own lectures.");
    return ok(resp, "Lecture removed from your list.", { log_id: logId });
  });

  return { getLecturePlan, markHeard, unmarkHeard, addMyLecture, removeMyLecture };
};
