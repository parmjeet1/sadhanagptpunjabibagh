// READING - counsellor endpoints: groups / sub-groups, customise the reading list for a scope,
// reset it, and see the mentees' reading status. Counsellors only (route uses checkCounsellor);
// the counsellor always comes from the login token and may only touch his OWN groups / mentees.
// Factory style like the student controllers, so it can be tested on a throwaway database.

import { cleanText, cleanLink, todayIST, summarize } from "./readingRules.js";
import { findPlan } from "./ReadingStudentController.js";
import { resolveScope, findOwnPlan, menteesInScope, inTransaction, placeholders } from "./scopeHelpers.js";

const MAX_LEVELS = 20;
const MAX_BOOKS_PER_LEVEL = 200;
const MAX_BOOKS_TOTAL = 300;
const OLD_STAMP = "2000-01-01 00:00:00"; // "not new": books mentees already saw before this save

const fail = (resp, code, message, extra = {}) => resp.json({ status: 0, code, message: [message], ...extra });
const ok = (resp, message, data = {}) => resp.json({ status: 1, code: 200, message: [message], data });
const params = (req) => ({ ...(req.query || {}), ...(req.body || {}) });
const meOf = (req) => req.user?.user_id;

export const createCounsellorReadingHandlers = (db, { now = () => Date.now() } = {}) => {
  const guard = (fn) => async (req, resp) => {
    try {
      if (!meOf(req)) return fail(resp, 401, "Please log in again.");
      return await fn(req, resp, meOf(req));
    } catch (error) {
      console.error("[reading-counsellor] error:", error);
      return fail(resp, 500, "Something went wrong. Please try again.");
    }
  };
  const withScope = (fn) => guard(async (req, resp, me) => {
    const sc = await resolveScope(db, me, params(req));
    if (sc.error) return fail(resp, sc.error.code, sc.error.message);
    return fn(req, resp, me, sc);
  });

  /** The levels and books of one plan, in order. */
  const loadLevels = async (planId) => {
    const [levels] = await db.query(`SELECT id, name, name_hi FROM reading_plan_levels WHERE plan_id = ? ORDER BY sort_order, id`, [planId]);
    const [books] = await db.query(
      `SELECT pb.level_id, b.id AS book_id, b.title, b.title_hi, b.author, b.link, b.created_by,
              DATE_FORMAT(pb.created_at, '%Y-%m-%d %H:%i:%s') AS added_on
       FROM reading_plan_books pb
       JOIN reading_books b ON b.id = pb.book_id AND b.is_active = 1
       WHERE pb.plan_id = ? ORDER BY pb.level_id, pb.sort_order, pb.id`,
      [planId]
    );
    return levels.map((l) => ({
      level_id: Number(l.id),
      name: l.name,
      name_hi: l.name_hi,
      books: books.filter((b) => Number(b.level_id) === Number(l.id)).map((b) => ({
        book_id: Number(b.book_id), title: b.title, title_hi: b.title_hi, author: b.author, link: b.link,
        added_by_me: b.created_by !== null && b.created_by !== undefined,
      })),
    }));
  };

  /** GET /reading/counsellor/scopes - his groups and sub-groups with mentee counts and whether a custom list exists. */
  const getScopes = guard(async (req, resp, me) => {
    const [groups] = await db.query(`SELECT center_id, name FROM center_list WHERE counsller_id = ? ORDER BY name`, [me]);
    const [subs] = await db.query(`SELECT id, center_id, name FROM labels_list WHERE counsellor_id = ? ORDER BY name`, [me]);
    const [counts] = await db.query(
      `SELECT ua.center_id, ua.label_id, COUNT(DISTINCT uc.user_id) AS n
       FROM user_counsellors uc
       LEFT JOIN user_assignments ua ON ua.id = (SELECT MAX(ua2.id) FROM user_assignments ua2 WHERE ua2.user_id = uc.user_id)
       WHERE uc.counsller_id = ? AND (ua.counsellor_id IS NULL OR ua.counsellor_id = '' OR ua.counsellor_id = uc.counsller_id)
       GROUP BY ua.center_id, ua.label_id`,
      [me]
    );
    const [plans] = await db.query(`SELECT kind, scope, center_id, label_id FROM learning_plans WHERE owner_id = ?`, [me]);
    const num = (v) => (v === null || v === undefined ? null : Number(v));
    const has = (scope, center, label) => ({
      reading: plans.some((p) => p.kind === "reading" && p.scope === scope && num(p.center_id) === center && num(p.label_id) === label),
      lecture: plans.some((p) => p.kind === "lecture" && p.scope === scope && num(p.center_id) === center && num(p.label_id) === label),
    });
    const total = counts.reduce((a, c) => a + Number(c.n), 0);
    return ok(resp, "Groups fetched successfully!", {
      all: { name: "All groups", mentees: total, has_custom: has("all", null, null) },
      groups: groups.map((g) => ({
        group_id: Number(g.center_id),
        name: g.name,
        mentees: counts.filter((c) => num(c.center_id) === Number(g.center_id)).reduce((a, c) => a + Number(c.n), 0),
        has_custom: has("group", Number(g.center_id), null),
        subgroups: subs.filter((s) => Number(s.center_id) === Number(g.center_id)).map((s) => ({
          sub_id: Number(s.id),
          name: s.name,
          mentees: counts.filter((c) => num(c.label_id) === Number(s.id)).reduce((a, c) => a + Number(c.n), 0),
          has_custom: has("subgroup", Number(g.center_id), Number(s.id)),
        })),
      })),
    });
  });

  /** GET /reading/counsellor/plan?group_id&sub_id - the list in effect for this scope (to edit), plus the books he can add. */
  const getScopePlan = withScope(async (req, resp, me, sc) => {
    const eff = await findPlan(db, "reading", me, sc.centerId, sc.labelId);
    if (!eff) return fail(resp, 404, "Reading list is not set up yet.");
    const levels = await loadLevels(eff.id);
    const [library] = await db.query(
      `SELECT id AS book_id, title, title_hi, author, link, created_by FROM reading_books
       WHERE is_active = 1 AND (created_by IS NULL OR created_by = ?) ORDER BY (created_by IS NOT NULL), id`,
      [me]
    );
    return ok(resp, "Reading list fetched successfully!", {
      scope: { type: sc.scope, name: sc.name, group_id: sc.centerId, sub_id: sc.labelId },
      is_custom: eff.scope === sc.scope && eff.owner_id === me, // false = still using a wider list or the system default
      in_effect: eff.scope, // 'default' | 'all' | 'group' | 'subgroup': whose list the mentees of this scope really see
      levels,
      library: library.map((b) => ({ book_id: Number(b.book_id), title: b.title, title_hi: b.title_hi, author: b.author, link: b.link, added_by_me: b.created_by !== null })),
    });
  });

  /**
   * POST /reading/counsellor/save-plan  { group_id?, sub_id?, levels: [{ name, name_hi?, books: [ {book_id} | {title, title_hi?, author?, link?} ] }] }
   * Saves the whole list for this scope in one go (what the drag-and-drop window sends).
   */
  const savePlan = withScope(async (req, resp, me, sc) => {
    const { levels } = params(req);
    if (!Array.isArray(levels) || levels.length < 1 || levels.length > MAX_LEVELS) return fail(resp, 422, `Send 1 to ${MAX_LEVELS} levels.`);

    // 1. check the shape of everything
    const clean = [];
    let total = 0;
    for (const [i, lv] of levels.entries()) {
      const name = cleanText(lv?.name, 150);
      const nameHi = cleanText(lv?.name_hi, 150);
      if (!name) return fail(resp, 422, `Level ${i + 1}: name is required (150 letters at most).`);
      if (nameHi === undefined) return fail(resp, 422, `Level ${i + 1}: Hindi name is too long.`);
      if (!Array.isArray(lv.books) || lv.books.length > MAX_BOOKS_PER_LEVEL) return fail(resp, 422, `Level ${i + 1}: send a list of books (200 at most).`);
      const books = [];
      for (const b of lv.books) {
        if (b && b.book_id !== undefined && b.book_id !== null && b.book_id !== "") {
          const id = Number(b.book_id);
          if (!Number.isInteger(id) || id <= 0) return fail(resp, 422, "A book_id is not valid.");
          books.push({ id });
        } else {
          const title = cleanText(b?.title, 255);
          if (!title) return fail(resp, 422, `Level ${i + 1}: a new book needs a title (255 letters at most).`);
          const titleHi = cleanText(b.title_hi, 255);
          const author = b.author === undefined || b.author === null || String(b.author).trim() === "" ? "Srila Prabhupada" : cleanText(b.author, 150);
          const link = cleanLink(b.link);
          if (titleHi === undefined || !author || link === undefined) return fail(resp, 422, `Level ${i + 1}: "${title}" has a too long Hindi title/author or a link that does not start with http(s)://`);
          books.push({ title, titleHi, author, link });
        }
      }
      total += books.length;
      clean.push({ name, nameHi, books });
    }
    if (total < 1) return fail(resp, 422, "Add at least one book (or use reset to go back to the default list).");
    if (total > MAX_BOOKS_TOTAL) return fail(resp, 422, `A list can have ${MAX_BOOKS_TOTAL} books at most.`);

    // 2. every named book must exist and be a system book or his own; new titles reuse his own book of the same name
    const ids = clean.flatMap((l) => l.books.filter((b) => b.id).map((b) => b.id));
    if (new Set(ids).size !== ids.length) return fail(resp, 422, "A book can be in the list only once.");
    if (ids.length) {
      const [found] = await db.query(`SELECT id, created_by FROM reading_books WHERE is_active = 1 AND id IN (${placeholders(ids)})`, ids);
      const okIds = new Set(found.filter((b) => b.created_by === null || b.created_by === me).map((b) => Number(b.id)));
      const bad = ids.filter((id) => !okIds.has(id));
      if (bad.length) return fail(resp, 422, `These books are not available to you: ${bad.join(", ")}`);
    }
    const [mine] = await db.query(`SELECT id, LOWER(title) AS t FROM reading_books WHERE created_by = ? AND is_active = 1`, [me]);
    const mineByTitle = new Map(mine.map((b) => [b.t, Number(b.id)]));
    const seenNew = new Set();
    for (const l of clean) for (const b of l.books) {
      if (b.id) continue;
      const key = b.title.toLowerCase();
      if (seenNew.has(key)) return fail(resp, 422, `"${b.title}" is in the list twice.`);
      seenNew.add(key);
      if (mineByTitle.has(key)) {
        b.id = mineByTitle.get(key);
        if (ids.includes(b.id)) return fail(resp, 422, `"${b.title}" is in the list twice.`);
        ids.push(b.id);
      }
    }

    // 3. which books were already visible to the mentees (so only really new books get the NEW badge)
    const eff = await findPlan(db, "reading", me, sc.centerId, sc.labelId);
    const prev = new Map();
    if (eff) {
      const [rows] = await db.query(`SELECT book_id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS added_on FROM reading_plan_books WHERE plan_id = ?`, [eff.id]);
      const ownExact = eff.scope === sc.scope && eff.owner_id === me;
      rows.forEach((r) => prev.set(Number(r.book_id), ownExact ? r.added_on : OLD_STAMP));
    }

    // 4. write it all or nothing
    const planId = await inTransaction(db, async (c) => {
      let own = await findOwnPlan(c, "reading", me, sc);
      let pid;
      if (own) pid = Number(own.id);
      else {
        const [ins] = await c.query(
          `INSERT INTO learning_plans (kind, scope, owner_id, center_id, label_id) VALUES ('reading', ?, ?, ?, ?)`,
          [sc.scope, me, sc.centerId, sc.labelId]
        );
        pid = Number(ins.insertId);
      }
      await c.query(`DELETE FROM reading_plan_levels WHERE plan_id = ?`, [pid]); // its books go with it
      for (const [li, l] of clean.entries()) {
        const [lins] = await c.query(`INSERT INTO reading_plan_levels (plan_id, name, name_hi, sort_order) VALUES (?, ?, ?, ?)`, [pid, l.name, l.nameHi, li + 1]);
        const levelId = Number(lins.insertId);
        for (const [bi, b] of l.books.entries()) {
          let bookId = b.id;
          if (!bookId) {
            const [bins] = await c.query(`INSERT INTO reading_books (title, title_hi, author, link, created_by) VALUES (?, ?, ?, ?, ?)`, [b.title, b.titleHi, b.author, b.link, me]);
            bookId = Number(bins.insertId);
          }
          if (prev.has(bookId)) {
            await c.query(`INSERT INTO reading_plan_books (plan_id, level_id, book_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`, [pid, levelId, bookId, bi + 1, prev.get(bookId)]);
          } else {
            await c.query(`INSERT INTO reading_plan_books (plan_id, level_id, book_id, sort_order) VALUES (?, ?, ?, ?)`, [pid, levelId, bookId, bi + 1]);
          }
        }
      }
      await c.query(`UPDATE learning_plans SET updated_at = NOW() WHERE id = ?`, [pid]);
      return pid;
    });
    return ok(resp, `Reading list saved for ${sc.name}.`, { plan_id: planId, scope: sc.scope, levels: clean.length, books: total });
  });

  /** POST /reading/counsellor/reset-plan  { group_id?, sub_id? } - removes his list for this scope (mentees fall back to the wider list / default). */
  const resetPlan = withScope(async (req, resp, me, sc) => {
    const own = await findOwnPlan(db, "reading", me, sc);
    if (!own) return ok(resp, `${sc.name} already uses the default list.`, { reset: false });
    await db.query(`DELETE FROM learning_plans WHERE id = ? AND owner_id = ? AND kind = 'reading'`, [own.id, me]); // levels + books go with it
    return ok(resp, `${sc.name} now uses the default list.`, { reset: true });
  });

  /** GET /reading/counsellor/mentees-status?group_id&sub_id - who is reading / has finished what, by mentee and by book. */
  const getMenteesStatus = withScope(async (req, resp, me, sc) => {
    const today = todayIST(now());
    const eff = await findPlan(db, "reading", me, sc.centerId, sc.labelId);
    const levels = eff ? await loadLevels(eff.id) : [];
    const planBooks = levels.flatMap((l) => l.books);
    const mentees = await menteesInScope(db, me, sc);
    const ids = mentees.map((m) => m.user_id);

    let statusRows = [];
    let ownRows = [];
    if (ids.length) {
      [statusRows] = await db.query(
        `SELECT s.user_id, s.book_id, s.status, DATEDIFF(?, s.started_at) AS days
         FROM user_book_status s WHERE s.user_id IN (${placeholders(ids)})`,
        [today, ...ids]
      );
      [ownRows] = await db.query(
        `SELECT b.created_by AS user_id, b.id AS book_id, b.title, s.status
         FROM reading_books b JOIN user_book_status s ON s.book_id = b.id AND s.user_id = b.created_by
         WHERE b.is_active = 1 AND b.created_by IN (${placeholders(ids)}) ORDER BY b.id`,
        ids
      );
    }
    const inPlan = new Set(planBooks.map((b) => b.book_id));
    const titleOf = new Map(planBooks.map((b) => [b.book_id, b.title]));
    const byUser = new Map(ids.map((id) => [id, []]));
    statusRows.forEach((r) => byUser.get(r.user_id)?.push(r));

    const menteeOut = mentees.map((m) => {
      const rows = byUser.get(m.user_id) || [];
      const statuses = {};
      rows.filter((r) => inPlan.has(Number(r.book_id))).forEach((r) => { statuses[Number(r.book_id)] = r.status; });
      const own = ownRows.filter((r) => r.user_id === m.user_id).map((r) => ({ book_id: Number(r.book_id), title: r.title, status: r.status }));
      const reading = rows.filter((r) => r.status === "ongoing" && inPlan.has(Number(r.book_id)))
        .map((r) => ({ book_id: Number(r.book_id), title: titleOf.get(Number(r.book_id)), days: r.days === null || r.days === undefined ? null : Number(r.days) }));
      const completed = Object.values(statuses).filter((s) => s === "completed").length + own.filter((o) => o.status === "completed").length;
      return {
        user_id: m.user_id, name: m.name, group_name: m.group_name, sub_name: m.sub_name,
        completed, reading, longest_ongoing_days: Math.max(0, ...reading.map((r) => r.days || 0)), statuses, own,
      };
    });
    const books = planBooks.map((b) => {
      const per = summarize(menteeOut.map((m) => ({ status: m.statuses[b.book_id] })));
      return { book_id: b.book_id, title: b.title, title_hi: b.title_hi, completed: per.completed, ongoing: per.ongoing, skipped: per.skipped, not_started: per.not_started };
    });
    return ok(resp, "Mentees' reading fetched successfully!", {
      scope: { type: sc.scope, name: sc.name, group_id: sc.centerId, sub_id: sc.labelId },
      mentee_count: menteeOut.length,
      levels: levels.map((l) => ({ level_id: l.level_id, name: l.name, name_hi: l.name_hi, book_ids: l.books.map((b) => b.book_id) })),
      books,
      mentees: menteeOut,
    });
  });

  return { getScopes, getScopePlan, savePlan, resetPlan, getMenteesStatus };
};
