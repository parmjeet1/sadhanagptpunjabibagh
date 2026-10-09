// READING (books) - endpoints for the logged-in person (student OR counsellor: their own list).
// Written as a factory that receives the database, so it can be tested against a throwaway
// database without starting the server. The real wiring is in ./index.js.
//
// The person always comes from the login token (req.user.user_id), never from the request.
// Needs the tables in DB-PROPOSAL.sql (nothing else is changed).

import {
  isValidBookStatus,
  cleanText,
  cleanLink,
  todayIST,
  isRealDate,
  statusDates,
  summarize,
} from "./readingRules.js";

const NEW_BADGE_DAYS = 14;

const fail = (resp, code, message, extra = {}) => resp.json({ status: 0, code, message: [message], ...extra });
const ok = (resp, message, data = {}) => resp.json({ status: 1, code: 200, message: [message], data });
const params = (req) => ({ ...(req.query || {}), ...(req.body || {}) });
const meOf = (req) => req.user?.user_id;

/** Which plan this person sees: sub-group plan -> group plan -> counsellor's "all mentees" plan -> system default. */
export const resolvePlan = async (db, userId, kind) => {
  const [[me]] = await db.query(
    `SELECT ua.center_id, ua.label_id,
            COALESCE(NULLIF(ua.counsellor_id, ''),
                     (SELECT uc.counsller_id FROM user_counsellors uc
                       WHERE uc.user_id = u.user_id AND uc.counsllor_type = 'primary' LIMIT 1)) AS counsellor_id
     FROM users u
     LEFT JOIN user_assignments ua ON ua.id = (SELECT MAX(ua2.id) FROM user_assignments ua2 WHERE ua2.user_id = u.user_id)
     WHERE u.user_id = ?`,
    [userId]
  );
  if (!me) return null;
  const owner = me.counsellor_id || null;
  const [[plan]] = await db.query(
    `SELECT id, scope, owner_id FROM learning_plans
     WHERE kind = ? AND (
            (scope = 'subgroup' AND owner_id = ? AND label_id  = ?)
         OR (scope = 'group'    AND owner_id = ? AND center_id = ?)
         OR (scope = 'all'      AND owner_id = ?)
         OR (scope = 'default'  AND owner_id IS NULL))
     ORDER BY FIELD(scope, 'subgroup', 'group', 'all', 'default') LIMIT 1`,
    [kind, owner, me.label_id, owner, me.center_id, owner]
  );
  return plan || null;
};

const BOOK_FIELDS = `b.id AS book_id, b.title, b.title_hi, b.author, b.link, b.cover_image,
       s.status, DATE_FORMAT(s.started_at, '%Y-%m-%d') AS started_at, DATE_FORMAT(s.completed_at, '%Y-%m-%d') AS completed_at`;

export const createReadingHandlers = (db, { now = () => Date.now() } = {}) => {
  const guard = (fn) => async (req, resp) => {
    try {
      if (!meOf(req)) return fail(resp, 401, "Please log in again.");
      return await fn(req, resp, meOf(req));
    } catch (error) {
      console.error("[reading] error:", error);
      return fail(resp, 500, "Something went wrong. Please try again.");
    }
  };

  /** GET /reading/plan - the reading list this person sees, with their own status on each book. */
  const getReadingPlan = guard(async (req, resp, me) => {
    const plan = await resolvePlan(db, me, "reading");
    if (!plan) return fail(resp, 404, "Reading list is not set up yet.");

    const [levels] = await db.query(
      `SELECT id, name, name_hi, sort_order FROM reading_plan_levels WHERE plan_id = ? ORDER BY sort_order, id`,
      [plan.id]
    );
    const [books] = await db.query(
      `SELECT pb.level_id, ${BOOK_FIELDS},
              (pb.created_at >= NOW() - INTERVAL ${NEW_BADGE_DAYS} DAY) AS recent
       FROM reading_plan_books pb
       JOIN reading_books b ON b.id = pb.book_id AND b.is_active = 1
       LEFT JOIN user_book_status s ON s.book_id = b.id AND s.user_id = ?
       WHERE pb.plan_id = ?
       ORDER BY pb.level_id, pb.sort_order, pb.id`,
      [me, plan.id]
    );
    const [mine] = await db.query(
      `SELECT ${BOOK_FIELDS}
       FROM reading_books b
       LEFT JOIN user_book_status s ON s.book_id = b.id AND s.user_id = ?
       WHERE b.created_by = ? AND b.is_active = 1
       ORDER BY b.id`,
      [me, me]
    );

    const shape = (b, withNew) => {
      const status = b.status || "not_started";
      return {
        book_id: Number(b.book_id),
        title: b.title,
        title_hi: b.title_hi,
        author: b.author,
        link: b.link,
        cover_image: b.cover_image,
        status,
        started_at: b.started_at,
        completed_at: b.completed_at,
        // NEW badge only for lists a counsellor edited (never the system list), and only while not yet started
        is_new: withNew ? Number(b.recent) === 1 && plan.scope !== "default" && status === "not_started" : false,
      };
    };
    const levelOut = levels.map((l) => ({
      level_id: Number(l.id),
      name: l.name,
      name_hi: l.name_hi,
      books: books.filter((b) => Number(b.level_id) === Number(l.id)).map((b) => shape(b, true)),
    }));
    const myBooks = mine.map((b) => shape(b, false));

    return ok(resp, "Reading list fetched successfully!", {
      plan: { plan_id: Number(plan.id), scope: plan.scope, is_default: plan.scope === "default" },
      levels: levelOut,
      my_books: myBooks,
      summary: summarize([...levelOut.flatMap((l) => l.books), ...myBooks]),
    });
  });

  /** POST /reading/book-status  { book_id, status, date? } */
  const setBookStatus = guard(async (req, resp, me) => {
    const { book_id, status, date } = params(req);
    const bookId = Number(book_id);
    if (!Number.isInteger(bookId) || bookId <= 0) return fail(resp, 422, "book_id is required");
    if (!isValidBookStatus(status)) return fail(resp, 422, "status must be not_started, ongoing, completed or skipped");
    const today = todayIST(now());
    if (date !== undefined && date !== null && date !== "") {
      if (!isRealDate(date)) return fail(resp, 422, "date must look like 2026-10-09");
      if (date > today) return fail(resp, 422, "date cannot be in the future");
    }
    const given = date ? String(date) : null;

    const [[book]] = await db.query(`SELECT id, created_by FROM reading_books WHERE id = ? AND is_active = 1`, [bookId]);
    if (!book) return fail(resp, 404, "Book not found.");

    const [[existing]] = await db.query(
      `SELECT status, DATE_FORMAT(started_at, '%Y-%m-%d') AS started_at, DATE_FORMAT(completed_at, '%Y-%m-%d') AS completed_at
       FROM user_book_status WHERE user_id = ? AND book_id = ?`,
      [me, bookId]
    );
    // allowed: the person's own book, a book in the list they see, or a book they already have a status on
    if (!existing && book.created_by !== me) {
      const plan = await resolvePlan(db, me, "reading");
      const [[inPlan]] = plan
        ? await db.query(`SELECT 1 AS ok FROM reading_plan_books WHERE plan_id = ? AND book_id = ? LIMIT 1`, [plan.id, bookId])
        : [[null]];
      if (!inPlan) return fail(resp, 403, "This book is not in your reading list.");
    }

    if (status === "not_started") {
      await db.query(`DELETE FROM user_book_status WHERE user_id = ? AND book_id = ?`, [me, bookId]);
      return ok(resp, "Book moved back to Not started.", { book_id: bookId, status, started_at: null, completed_at: null });
    }
    const d = statusDates(status, existing, today, given);
    await db.query(
      `INSERT INTO user_book_status (user_id, book_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), started_at = VALUES(started_at), completed_at = VALUES(completed_at)`,
      [me, bookId, status, d.started_at, d.completed_at]
    );
    return ok(resp, "Book status saved.", { book_id: bookId, status, ...d });
  });

  /** POST /reading/add-my-book  { title, title_hi?, author?, link?, status? }  - "another book I am reading" */
  const addMyBook = guard(async (req, resp, me) => {
    const p = params(req);
    const title = cleanText(p.title, 255);
    if (!title) return fail(resp, 422, title === undefined ? "Title is too long (255 letters at most)." : "Title is required");
    const titleHi = cleanText(p.title_hi, 255);
    if (titleHi === undefined) return fail(resp, 422, "Hindi title is too long (255 letters at most).");
    const author = p.author === undefined || p.author === null || String(p.author).trim() === "" ? "Srila Prabhupada" : cleanText(p.author, 150);
    if (!author) return fail(resp, 422, "Author is too long (150 letters at most).");
    const link = cleanLink(p.link);
    if (link === undefined) return fail(resp, 422, "Link must start with http:// or https://");
    const status = p.status === undefined || p.status === "" ? "ongoing" : p.status;
    if (!isValidBookStatus(status) || status === "not_started") return fail(resp, 422, "status must be ongoing, completed or skipped");

    const [[dup]] = await db.query(
      `SELECT id FROM reading_books WHERE created_by = ? AND is_active = 1 AND LOWER(title) = LOWER(?) LIMIT 1`,
      [me, title]
    );
    if (dup) return fail(resp, 409, "This book is already in your list.", { data: { book_id: Number(dup.id) } });

    const [ins] = await db.query(
      `INSERT INTO reading_books (title, title_hi, author, link, created_by) VALUES (?, ?, ?, ?, ?)`,
      [title, titleHi, author, link, me]
    );
    const bookId = Number(ins.insertId);
    const today = todayIST(now());
    const d = statusDates(status, null, today);
    await db.query(
      `INSERT INTO user_book_status (user_id, book_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)`,
      [me, bookId, status, d.started_at, d.completed_at]
    );
    return ok(resp, "Book added to your list.", { book_id: bookId, title, title_hi: titleHi, author, link, status, ...d });
  });

  /** POST /reading/remove-my-book  { book_id }  - only a book the person added himself, and only if it is in no reading list */
  const removeMyBook = guard(async (req, resp, me) => {
    const bookId = Number(params(req).book_id);
    if (!Number.isInteger(bookId) || bookId <= 0) return fail(resp, 422, "book_id is required");
    const [[book]] = await db.query(`SELECT id, created_by FROM reading_books WHERE id = ?`, [bookId]);
    if (!book || book.created_by !== me) return fail(resp, 404, "Book not found in your own books.");
    const [[inList]] = await db.query(`SELECT 1 AS ok FROM reading_plan_books WHERE book_id = ? LIMIT 1`, [bookId]);
    if (inList) return fail(resp, 409, "This book is part of a reading list. Remove it from the list first.");
    await db.query(`DELETE FROM reading_books WHERE id = ? AND created_by = ?`, [bookId, me]);
    return ok(resp, "Book removed from your list.", { book_id: bookId });
  });

  return { getReadingPlan, setBookStatus, addMyBook, removeMyBook };
};
