// MENTEES REPORT - counsellor endpoints for the "Mentees Report" tab:
//   1. the list of mentees (by group / sub-group / ungrouped) with the lectures each heard in the last 7 days
//      and the book each is reading now;
//   2. one mentee's full picture: books completed (from the list that mentee sees), lectures heard in the
//      last 7 days, every book's status and every lecture heard (newest first, with the kind of speaker).
// Counsellors only (route uses checkCounsellor). The counsellor comes from the login token and may only
// see his OWN mentees. Same style as the other controllers: a factory that receives the database.

import { todayIST, dateDaysAgo, speakerKind, countByKind } from "./readingRules.js";
import { findPlan } from "./ReadingStudentController.js";
import { resolveScope, menteesInScope, placeholders } from "./scopeHelpers.js";

const LECTURE_LIMIT = 300;

const fail = (resp, code, message, extra = {}) => resp.json({ status: 0, code, message: [message], ...extra });
const ok = (resp, message, data = {}) => resp.json({ status: 1, code: 200, message: [message], data });
const params = (req) => ({ ...(req.query || {}), ...(req.body || {}) });
const meOf = (req) => req.user?.user_id;

export const createCounsellorMenteeReportHandlers = (db, { now = () => Date.now() } = {}) => {
  const guard = (fn) => async (req, resp) => {
    try {
      if (!meOf(req)) return fail(resp, 401, "Please log in again.");
      return await fn(req, resp, meOf(req));
    } catch (error) {
      console.error("[mentees-report] error:", error);
      return fail(resp, 500, "Something went wrong. Please try again.");
    }
  };

  /**
   * GET /mentees-report/list?group_id&sub_id
   * Mentees arranged group -> sub-group (people with no group last, under "Ungrouped"); inside each
   * sub-group the mentee who heard the MOST lectures in the last 7 days comes first.
   */
  const getMenteesReportList = guard(async (req, resp, me) => {
    const sc = await resolveScope(db, me, params(req));
    if (sc.error) return fail(resp, sc.error.code, sc.error.message);
    const mentees = await menteesInScope(db, me, sc);
    const ids = mentees.map((m) => m.user_id);
    const since = dateDaysAgo(todayIST(now()), 6); // today and the 6 days before it = last 7 days

    let heard = [];
    let reading = [];
    if (ids.length) {
      [heard] = await db.query(
        `SELECT user_id, SUM(heard_on >= ?) AS last7, COUNT(*) AS total
         FROM user_lecture_log WHERE user_id IN (${placeholders(ids)}) GROUP BY user_id`,
        [since, ...ids]
      );
      [reading] = await db.query(
        `SELECT s.user_id, b.title FROM user_book_status s JOIN reading_books b ON b.id = s.book_id
         WHERE s.status = 'ongoing' AND s.user_id IN (${placeholders(ids)}) ORDER BY s.started_at, s.book_id`,
        ids
      );
    }
    const heardOf = new Map(heard.map((h) => [String(h.user_id), h]));
    const rows = mentees.map((m) => ({
      user_id: String(m.user_id),
      name: m.name,
      group_id: m.center_id === null || m.center_id === undefined ? null : Number(m.center_id),
      group_name: m.group_name || null,
      sub_id: m.label_id === null || m.label_id === undefined ? null : Number(m.label_id),
      sub_name: m.sub_name || null,
      last_7_days: Number(heardOf.get(String(m.user_id))?.last7 || 0),
      total_heard: Number(heardOf.get(String(m.user_id))?.total || 0),
      ongoing_books: reading.filter((r) => String(r.user_id) === String(m.user_id)).map((r) => r.title),
    }));

    // group -> sub-group tree; "Ungrouped" (no group) and "No sub-group" always come last
    const byName = (a, b) => String(a.name).localeCompare(String(b.name));
    const mostHeardFirst = (a, b) => b.last_7_days - a.last_7_days || String(a.name).localeCompare(String(b.name));
    const groups = [];
    for (const r of rows) {
      let g = groups.find((x) => x.group_id === r.group_id);
      if (!g) { g = { group_id: r.group_id, name: r.group_name || "Ungrouped", subgroups: [] }; groups.push(g); }
      let s = g.subgroups.find((x) => x.sub_id === r.sub_id);
      if (!s) { s = { sub_id: r.sub_id, name: r.sub_name || "No sub-group", mentees: [] }; g.subgroups.push(s); }
      s.mentees.push(r);
    }
    const lastLast = (list, idOf) => [...list.filter((x) => idOf(x) !== null).sort(byName), ...list.filter((x) => idOf(x) === null)];
    groups.forEach((g) => { g.subgroups.forEach((s) => s.mentees.sort(mostHeardFirst)); g.subgroups = lastLast(g.subgroups, (x) => x.sub_id); g.count = g.subgroups.reduce((n, s) => n + s.mentees.length, 0); });
    const tree = lastLast(groups, (x) => x.group_id);

    return ok(resp, "Mentees report fetched successfully!", {
      scope: { type: sc.scope, name: sc.name, group_id: sc.centerId, sub_id: sc.labelId },
      since,
      mentee_count: rows.length,
      heard_last_7_days: rows.reduce((n, r) => n + r.last_7_days, 0),
      groups: tree,
    });
  });

  /** GET /mentees-report/mentee?user_id=...  - one mentee's books and lectures (only his own mentees). */
  const getMenteeReport = guard(async (req, resp, me) => {
    const userId = String(params(req).user_id || "").trim();
    if (!userId) return fail(resp, 422, "user_id is required");
    const all = await menteesInScope(db, me, { scope: "all", centerId: null, labelId: null });
    const m = all.find((x) => String(x.user_id) === userId); // ids can come back from the database as numbers
    if (!m) return fail(resp, 404, "Mentee not found.");

    const today = todayIST(now());
    const since = dateDaysAgo(today, 6);

    // books: the list this mentee sees (his sub-group / group / the counsellor's all-mentees / default list)
    const plan = await findPlan(db, "reading", me, m.center_id ?? null, m.label_id ?? null);
    let levels = [];
    if (plan) {
      const [lv] = await db.query(`SELECT id, name, name_hi FROM reading_plan_levels WHERE plan_id = ? ORDER BY sort_order, id`, [plan.id]);
      const [bk] = await db.query(
        `SELECT pb.level_id, b.id AS book_id, b.title, b.title_hi, s.status,
                DATE_FORMAT(s.started_at, '%Y-%m-%d') AS started_at, DATE_FORMAT(s.completed_at, '%Y-%m-%d') AS completed_at,
                DATEDIFF(?, s.started_at) AS days
         FROM reading_plan_books pb
         JOIN reading_books b ON b.id = pb.book_id AND b.is_active = 1
         LEFT JOIN user_book_status s ON s.book_id = b.id AND s.user_id = ?
         WHERE pb.plan_id = ? ORDER BY pb.level_id, pb.sort_order, pb.id`,
        [today, userId, plan.id]
      );
      levels = lv.map((l) => ({
        level_id: Number(l.id), name: l.name, name_hi: l.name_hi,
        books: bk.filter((b) => Number(b.level_id) === Number(l.id)).map((b) => ({
          book_id: Number(b.book_id), title: b.title, title_hi: b.title_hi, status: b.status || "not_started",
          started_at: b.started_at, completed_at: b.completed_at,
          days: b.status === "ongoing" && b.days !== null && b.days !== undefined ? Number(b.days) : null,
        })),
      }));
    }
    const planBooks = levels.flatMap((l) => l.books);
    const [own] = await db.query(
      `SELECT b.id AS book_id, b.title, s.status FROM reading_books b
       JOIN user_book_status s ON s.book_id = b.id AND s.user_id = b.created_by
       WHERE b.created_by = ? AND b.is_active = 1 ORDER BY b.id`,
      [userId]
    );

    // lectures: everything he heard, newest first; "recommended" = in the list he sees
    const lecturePlan = await findPlan(db, "lecture", me, m.center_id ?? null, m.label_id ?? null);
    const recommendedIds = new Set();
    if (lecturePlan) {
      const [r] = await db.query(`SELECT lecture_id FROM lecture_plan_items WHERE plan_id = ?`, [lecturePlan.id]);
      r.forEach((x) => recommendedIds.add(Number(x.lecture_id)));
    }
    const [log] = await db.query(
      `SELECT l.id AS log_id, l.lecture_id, l.title, l.speaker, l.link, DATE_FORMAT(l.heard_on, '%Y-%m-%d') AS heard_on
       FROM user_lecture_log l WHERE l.user_id = ? ORDER BY l.heard_on DESC, l.id DESC`,
      [userId]
    );
    const items = log.slice(0, LECTURE_LIMIT).map((l) => ({
      log_id: Number(l.log_id), title: l.title, speaker: l.speaker, speaker_kind: speakerKind(l.speaker), link: l.link,
      heard_on: l.heard_on, is_custom: l.lecture_id === null || l.lecture_id === undefined,
      recommended: l.lecture_id !== null && l.lecture_id !== undefined && recommendedIds.has(Number(l.lecture_id)),
    }));

    return ok(resp, "Mentee report fetched successfully!", {
      mentee: {
        user_id: String(m.user_id), name: m.name,
        group_id: m.center_id === null || m.center_id === undefined ? null : Number(m.center_id), group_name: m.group_name || null,
        sub_id: m.label_id === null || m.label_id === undefined ? null : Number(m.label_id), sub_name: m.sub_name || null,
      },
      reading: {
        list: plan ? { plan_id: Number(plan.id), scope: plan.scope, is_default: plan.scope === "default" } : null,
        total: planBooks.length,
        completed: planBooks.filter((b) => b.status === "completed").length,
        ongoing: planBooks.filter((b) => b.status === "ongoing").length,
        levels,
        own_books: own.map((o) => ({ book_id: Number(o.book_id), title: o.title, status: o.status })),
      },
      lectures: {
        since,
        last_7_days: log.filter((l) => l.heard_on >= since).length,
        total_heard: log.length,
        by_kind: countByKind(log),
        recommended_total: recommendedIds.size,
        recommended_heard: log.filter((l) => l.lecture_id !== null && l.lecture_id !== undefined && recommendedIds.has(Number(l.lecture_id))).length,
        items,
      },
    });
  });

  return { getMenteesReportList, getMenteeReport };
};
