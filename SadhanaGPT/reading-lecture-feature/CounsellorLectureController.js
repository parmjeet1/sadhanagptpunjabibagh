// LECTURES - counsellor endpoints: customise the recommended lecture list for a scope (all mentees /
// group / sub-group), reset it, and see which lectures the mentees say they heard.
// Counsellors only (route uses checkCounsellor); the counsellor comes from the login token and may only
// touch his OWN groups and mentees. An Excel sheet is read in the browser (title, speaker, link columns)
// and sent here as a normal list, so every row goes through the same checks below.

import { cleanText, cleanLink } from "./readingRules.js";
import { findPlan } from "./ReadingStudentController.js";
import { resolveScope, findOwnPlan, menteesInScope, inTransaction, placeholders } from "./scopeHelpers.js";

const MAX_LECTURES = 500;
const OLD_STAMP = "2000-01-01 00:00:00"; // "not new": lectures mentees already saw before this save
const DEFAULT_SPEAKER = "Srila Prabhupada";
const LOG_LIMIT_PER_MENTEE = 100;

const fail = (resp, code, message, extra = {}) => resp.json({ status: 0, code, message: [message], ...extra });
const ok = (resp, message, data = {}) => resp.json({ status: 1, code: 200, message: [message], data });
const params = (req) => ({ ...(req.query || {}), ...(req.body || {}) });
const meOf = (req) => req.user?.user_id;
const key = (title, link) => `${title.toLowerCase()}|${link || ""}`;

export const createCounsellorLectureHandlers = (db) => {
  const guard = (fn) => async (req, resp) => {
    try {
      if (!meOf(req)) return fail(resp, 401, "Please log in again.");
      return await fn(req, resp, meOf(req));
    } catch (error) {
      console.error("[lectures-counsellor] error:", error);
      return fail(resp, 500, "Something went wrong. Please try again.");
    }
  };
  const withScope = (fn) => guard(async (req, resp, me) => {
    const sc = await resolveScope(db, me, params(req));
    if (sc.error) return fail(resp, sc.error.code, sc.error.message);
    return fn(req, resp, me, sc);
  });

  const loadItems = async (planId) => {
    const [rows] = await db.query(
      `SELECT lec.id AS lecture_id, lec.title, lec.title_hi, lec.speaker, lec.link, lec.topic, lec.created_by
       FROM lecture_plan_items li JOIN lectures lec ON lec.id = li.lecture_id AND lec.is_active = 1
       WHERE li.plan_id = ? ORDER BY li.sort_order, li.id`,
      [planId]
    );
    return rows.map((r) => ({
      lecture_id: Number(r.lecture_id), title: r.title, title_hi: r.title_hi, speaker: r.speaker, link: r.link, topic: r.topic,
      added_by_me: r.created_by !== null && r.created_by !== undefined,
    }));
  };

  /** GET /lectures/counsellor/plan?group_id&sub_id - the lecture list in effect for this scope (to edit). */
  const getScopePlan = withScope(async (req, resp, me, sc) => {
    const eff = await findPlan(db, "lecture", me, sc.centerId, sc.labelId);
    if (!eff) return fail(resp, 404, "Lecture list is not set up yet.");
    const [library] = await db.query(
      `SELECT id AS lecture_id, title, title_hi, speaker, link, topic, created_by FROM lectures
       WHERE is_active = 1 AND (created_by IS NULL OR created_by = ?) ORDER BY (created_by IS NOT NULL), id LIMIT 1000`,
      [me]
    );
    return ok(resp, "Lecture list fetched successfully!", {
      scope: { type: sc.scope, name: sc.name, group_id: sc.centerId, sub_id: sc.labelId },
      is_custom: eff.scope === sc.scope && eff.owner_id === me,
      in_effect: eff.scope,
      lectures: await loadItems(eff.id),
      library: library.map((l) => ({ lecture_id: Number(l.lecture_id), title: l.title, title_hi: l.title_hi, speaker: l.speaker, link: l.link, topic: l.topic, added_by_me: l.created_by !== null })),
    });
  });

  /**
   * POST /lectures/counsellor/save-plan  { group_id?, sub_id?, lectures: [ {lecture_id} | {title, title_hi?, speaker?, link?, topic?} ] }
   * Saves the whole recommended lecture list for this scope, in the order sent.
   */
  const savePlan = withScope(async (req, resp, me, sc) => {
    const { lectures } = params(req);
    if (!Array.isArray(lectures) || lectures.length < 1 || lectures.length > MAX_LECTURES) return fail(resp, 422, `Send 1 to ${MAX_LECTURES} lectures.`);

    // 1. shape of every row (the row number is 1-based, as in the sheet without its header)
    const rows = [];
    for (const [i, l] of lectures.entries()) {
      const at = `Lecture ${i + 1}`;
      if (l && l.lecture_id !== undefined && l.lecture_id !== null && l.lecture_id !== "") {
        const id = Number(l.lecture_id);
        if (!Number.isInteger(id) || id <= 0) return fail(resp, 422, `${at}: lecture_id is not valid.`);
        rows.push({ id });
        continue;
      }
      const title = cleanText(l?.title, 255);
      if (!title) return fail(resp, 422, `${at}: title is required (255 letters at most).`);
      const titleHi = cleanText(l.title_hi, 255);
      const speaker = l.speaker === undefined || l.speaker === null || String(l.speaker).trim() === "" ? DEFAULT_SPEAKER : cleanText(l.speaker, 150);
      const topic = cleanText(l.topic, 150);
      const link = cleanLink(l.link);
      if (titleHi === undefined || !speaker || topic === undefined) return fail(resp, 422, `${at}: "${title}" has a too long Hindi title, speaker or topic.`);
      if (link === undefined) return fail(resp, 422, `${at}: "${title}" has a link that does not start with http:// or https://`);
      rows.push({ title, titleHi, speaker, topic, link });
    }

    // 2. named lectures must exist and be system lectures or his own; new rows reuse his lecture with the same title + link
    const ids = rows.filter((r) => r.id).map((r) => r.id);
    if (new Set(ids).size !== ids.length) return fail(resp, 422, "A lecture can be in the list only once.");
    if (ids.length) {
      const [found] = await db.query(`SELECT id, created_by FROM lectures WHERE is_active = 1 AND id IN (${placeholders(ids)})`, ids);
      const okIds = new Set(found.filter((r) => r.created_by === null || r.created_by === me).map((r) => Number(r.id)));
      const bad = ids.filter((id) => !okIds.has(id));
      if (bad.length) return fail(resp, 422, `These lectures are not available to you: ${bad.join(", ")}`);
    }
    const [mine] = await db.query(`SELECT id, LOWER(title) AS t, IFNULL(link, '') AS l FROM lectures WHERE created_by = ? AND is_active = 1`, [me]);
    const mineByKey = new Map(mine.map((r) => [`${r.t}|${r.l}`, Number(r.id)]));
    const seen = new Set();
    for (const [i, r] of rows.entries()) {
      if (r.id) continue;
      const k = key(r.title, r.link);
      if (seen.has(k)) return fail(resp, 422, `Lecture ${i + 1}: "${r.title}" is in the list twice.`);
      seen.add(k);
      if (mineByKey.has(k)) {
        r.id = mineByKey.get(k);
        if (ids.includes(r.id)) return fail(resp, 422, `Lecture ${i + 1}: "${r.title}" is in the list twice.`);
        ids.push(r.id);
      }
    }

    // 3. lectures mentees already saw keep their "added on" date; only really new ones show NEW
    const eff = await findPlan(db, "lecture", me, sc.centerId, sc.labelId);
    const prev = new Map();
    if (eff) {
      const [old] = await db.query(`SELECT lecture_id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS added_on FROM lecture_plan_items WHERE plan_id = ?`, [eff.id]);
      const ownExact = eff.scope === sc.scope && eff.owner_id === me;
      old.forEach((r) => prev.set(Number(r.lecture_id), ownExact ? r.added_on : OLD_STAMP));
    }

    // 4. all or nothing
    const planId = await inTransaction(db, async (c) => {
      const own = await findOwnPlan(c, "lecture", me, sc);
      let pid;
      if (own) pid = Number(own.id);
      else {
        const [ins] = await c.query(`INSERT INTO learning_plans (kind, scope, owner_id, center_id, label_id) VALUES ('lecture', ?, ?, ?, ?)`, [sc.scope, me, sc.centerId, sc.labelId]);
        pid = Number(ins.insertId);
      }
      await c.query(`DELETE FROM lecture_plan_items WHERE plan_id = ?`, [pid]);
      for (const [i, r] of rows.entries()) {
        let lectureId = r.id;
        if (!lectureId) {
          const [lins] = await c.query(
            `INSERT INTO lectures (title, title_hi, speaker, link, topic, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [r.title, r.titleHi, r.speaker, r.link, r.topic, me]
          );
          lectureId = Number(lins.insertId);
        }
        if (prev.has(lectureId)) {
          await c.query(`INSERT INTO lecture_plan_items (plan_id, lecture_id, sort_order, created_at) VALUES (?, ?, ?, ?)`, [pid, lectureId, i + 1, prev.get(lectureId)]);
        } else {
          await c.query(`INSERT INTO lecture_plan_items (plan_id, lecture_id, sort_order) VALUES (?, ?, ?)`, [pid, lectureId, i + 1]);
        }
      }
      await c.query(`UPDATE learning_plans SET updated_at = NOW() WHERE id = ?`, [pid]);
      return pid;
    });
    return ok(resp, `Lecture list saved for ${sc.name}.`, { plan_id: planId, scope: sc.scope, lectures: rows.length });
  });

  /** POST /lectures/counsellor/reset-plan  { group_id?, sub_id? } - back to the wider list / system default. */
  const resetPlan = withScope(async (req, resp, me, sc) => {
    const own = await findOwnPlan(db, "lecture", me, sc);
    if (!own) return ok(resp, `${sc.name} already uses the default lecture list.`, { reset: false });
    await db.query(`DELETE FROM learning_plans WHERE id = ? AND owner_id = ? AND kind = 'lecture'`, [own.id, me]); // its items go with it
    return ok(resp, `${sc.name} now uses the default lecture list.`, { reset: true });
  });

  /** GET /lectures/counsellor/mentees-lectures?group_id&sub_id - lectures each mentee says he heard (newest first). */
  const getMenteesLectures = withScope(async (req, resp, me, sc) => {
    const mentees = await menteesInScope(db, me, sc);
    const ids = mentees.map((m) => m.user_id);
    const eff = await findPlan(db, "lecture", me, sc.centerId, sc.labelId);
    const recommended = new Set();
    if (eff) {
      const [r] = await db.query(`SELECT lecture_id FROM lecture_plan_items WHERE plan_id = ?`, [eff.id]);
      r.forEach((x) => recommended.add(Number(x.lecture_id)));
    }
    let log = [];
    if (ids.length) {
      [log] = await db.query(
        `SELECT l.user_id, l.id AS log_id, l.lecture_id, l.title, l.speaker, l.link, DATE_FORMAT(l.heard_on, '%Y-%m-%d') AS heard_on
         FROM user_lecture_log l WHERE l.user_id IN (${placeholders(ids)}) ORDER BY l.heard_on DESC, l.id DESC`,
        ids
      );
    }
    const out = mentees.map((m) => {
      const mine = log.filter((l) => l.user_id === m.user_id);
      return {
        user_id: m.user_id, name: m.name, group_name: m.group_name, sub_name: m.sub_name,
        total_heard: mine.length,
        recommended_heard: mine.filter((l) => l.lecture_id !== null && recommended.has(Number(l.lecture_id))).length,
        last_heard_on: mine[0]?.heard_on || null,
        lectures: mine.slice(0, LOG_LIMIT_PER_MENTEE).map((l) => ({
          log_id: Number(l.log_id), lecture_id: l.lecture_id === null ? null : Number(l.lecture_id),
          title: l.title, speaker: l.speaker, link: l.link, heard_on: l.heard_on, is_custom: l.lecture_id === null,
        })),
      };
    });
    return ok(resp, "Mentees' lectures fetched successfully!", {
      scope: { type: sc.scope, name: sc.name, group_id: sc.centerId, sub_id: sc.labelId },
      mentee_count: out.length, recommended_total: recommended.size, mentees: out,
    });
  });

  return { getScopePlan, savePlan, resetPlan, getMenteesLectures };
};
