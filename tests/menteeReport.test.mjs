// Runs the Mentees Report endpoints against a THROWAWAY MariaDB (never a real database).
// Skipped unless READING_TEST_SOCKET is set, e.g.
//   READING_TEST_SOCKET=/tmp/rs.sock node --test tests/menteeReport.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createCounsellorMenteeReportHandlers } from "../SadhanaGPT/reading-lecture-feature/CounsellorMenteeReportController.js";
import { SOCK, cli, fakeDb, call, createBaseDb, dropDb } from "./helpers/throwawayDb.mjs";

const opts = { skip: SOCK ? false : "set READING_TEST_SOCKET to run (needs a throwaway local MariaDB)" };
const FIXED_NOW = Date.parse("2026-10-09T06:00:00Z"); // 2026-10-09 in India -> last 7 days = 2026-10-03 .. 2026-10-09
let R;

const book = (title) => `(SELECT id FROM reading_books WHERE title = '${title}' AND created_by IS NULL)`;

test.before(() => {
  if (!SOCK) return;
  createBaseDb();
  cli(`
    INSERT INTO users (user_id, user_type, name) VALUES ('S_y2', 'student', 'Aaa Second Youth');
    INSERT INTO user_assignments (user_id, center_id, label_id, counsellor_id) VALUES ('S_y2', 5, 9, 'C1');
    INSERT INTO user_counsellors (user_id, counsller_id, counsllor_type) VALUES ('S_y2', 'C1', 'primary');

    INSERT INTO lectures (title, speaker, link) VALUES ('Rec PB', 'Srila Prabhupada', 'https://example.com/pb'), ('Rec Guru', 'Guru Maharaj', NULL);
    SET @d := (SELECT id FROM learning_plans WHERE kind='lecture' AND scope='default');
    INSERT INTO lecture_plan_items (plan_id, lecture_id, sort_order) SELECT @d, id, id FROM lectures;
    SET @pb := (SELECT id FROM lectures WHERE title='Rec PB');
    SET @gu := (SELECT id FROM lectures WHERE title='Rec Guru');

    -- lectures heard (today is 2026-10-09)
    INSERT INTO user_lecture_log (user_id, lecture_id, title, speaker, link, heard_on) VALUES
      ('S_grp', @pb, 'Rec PB', 'Srila Prabhupada', 'https://example.com/pb', '2026-10-09'),
      ('S_grp', @gu, 'Rec Guru', 'Guru Maharaj', NULL, '2026-10-05'),
      ('S_grp', NULL, 'Own other', 'Others', NULL, '2026-10-03'),
      ('S_grp', NULL, 'Too old', 'Srila Prabhupada', NULL, '2026-10-02'),
      ('S_sub', @pb, 'Rec PB', 'Srila Prabhupada', NULL, '2026-10-08'),
      ('S_y2', NULL, 'Y2 a', 'Srila Prabhupada', NULL, '2026-10-09'),
      ('S_y2', NULL, 'Y2 b', 'Srila Prabhupada', NULL, '2026-10-08'),
      ('S_y2', NULL, 'Y2 c', 'Srila Prabhupada', NULL, '2026-10-07'),
      ('S_y2', NULL, 'Y2 d', 'Srila Prabhupada', NULL, '2026-10-06'),
      ('S_all', NULL, 'All a', 'Srila Prabhupada', NULL, '2026-10-09'),
      ('S_other', NULL, 'Not my mentee', 'Srila Prabhupada', NULL, '2026-10-09');

    -- books
    INSERT INTO user_book_status (user_id, book_id, status, started_at, completed_at) VALUES
      ('S_grp', ${book("Elevation to Krishna Consciousness")}, 'completed', '2026-09-01', '2026-09-20'),
      ('S_grp', ${book("On The Way to Krishna")}, 'ongoing', '2026-09-29', NULL),
      ('S_grp', ${book("Perfection of Yoga")}, 'skipped', NULL, NULL),
      ('S_sub', ${book("Elevation to Krishna Consciousness")}, 'ongoing', '2026-10-08', NULL);
    INSERT INTO reading_books (title, created_by) VALUES ('Grp own book', 'S_grp');
    INSERT INTO user_book_status (user_id, book_id, status, started_at) VALUES ('S_grp', (SELECT id FROM reading_books WHERE title='Grp own book'), 'ongoing', '2026-10-01');
  `);
  R = createCounsellorMenteeReportHandlers(fakeDb, { now: () => FIXED_NOW });
});
test.after(() => dropDb());

const flat = (d) => d.groups.flatMap((g) => g.subgroups.flatMap((s) => s.mentees.map((m) => m.user_id)));

test("not logged in / someone else's group is refused", opts, async () => {
  assert.equal((await call(R.getMenteesReportList, null)).code, 401);
  assert.equal((await call(R.getMenteeReport, null)).code, 401);
  assert.equal((await call(R.getMenteesReportList, "C2", { group_id: 5 })).code, 403);
  assert.equal((await call(R.getMenteesReportList, "C1", { group_id: "abc" })).code, 422);
});

test("all groups: arranged group -> sub-group, Ungrouped last, most heard first, count of last 7 days", opts, async () => {
  const d = (await call(R.getMenteesReportList, "C1")).data;
  assert.deepEqual(d.groups.map((g) => g.name), ["Sunday Class", "Weekday Class", "Ungrouped"]);
  assert.deepEqual(d.groups.map((g) => g.count), [3, 1, 1]);
  const sunday = d.groups[0];
  assert.deepEqual(sunday.subgroups.map((s) => s.name), ["Ladies", "Youth"]);
  // Youth: S_y2 heard 4, S_sub heard 1 -> S_y2 first (most heard first)
  assert.deepEqual(sunday.subgroups[1].mentees.map((m) => [m.user_id, m.last_7_days]), [["S_y2", 4], ["S_sub", 1]]);
  // 2026-10-03 counts, 2026-10-02 does not: S_grp heard 3 (10-09, 10-05, 10-03), total 4
  const grp = sunday.subgroups[0].mentees[0];
  assert.deepEqual([grp.user_id, grp.last_7_days, grp.total_heard], ["S_grp", 3, 4]);
  assert.deepEqual(d.groups[2].subgroups[0].mentees.map((m) => m.user_id), ["S_prim"]);
  assert.equal(d.groups[2].subgroups[0].name, "No sub-group");
  assert.deepEqual([d.mentee_count, d.heard_last_7_days, d.since], [5, 3 + 1 + 4 + 1, "2026-10-03"]);
  assert.ok(!flat(d).includes("S_other")); // another counsellor's mentee never appears
});

test("the book each mentee is reading now (own books included)", opts, async () => {
  const d = (await call(R.getMenteesReportList, "C1")).data;
  const m = Object.fromEntries(d.groups.flatMap((g) => g.subgroups.flatMap((s) => s.mentees)).map((x) => [x.user_id, x]));
  assert.deepEqual(m.S_grp.ongoing_books, ["On The Way to Krishna", "Grp own book"]); // oldest start first
  assert.deepEqual(m.S_sub.ongoing_books, ["Elevation to Krishna Consciousness"]);
  assert.deepEqual(m.S_all.ongoing_books, []);
});

test("one group / one sub-group only (no Ungrouped there)", opts, async () => {
  let d = (await call(R.getMenteesReportList, "C1", { group_id: 5 })).data;
  assert.deepEqual(d.groups.map((g) => g.name), ["Sunday Class"]);
  assert.equal(d.mentee_count, 3);
  d = (await call(R.getMenteesReportList, "C1", { group_id: 5, sub_id: 9 })).data;
  assert.deepEqual(flat(d), ["S_y2", "S_sub"]);
  d = (await call(R.getMenteesReportList, "C1", { group_id: 7 })).data;
  assert.deepEqual(flat(d), ["S_all"]);
});

test("a counsellor with no mentees gets an empty list", opts, async () => {
  const d = (await call(R.getMenteesReportList, "C2")).data;
  assert.deepEqual(flat(d), ["S_other"]);
  assert.equal((await call(R.getMenteesReportList, "C2", { group_id: 11 })).data.mentee_count, 0);
});

test("mentee window: books from the list he sees, circles, dated lectures with speaker kind", opts, async () => {
  const r = await call(R.getMenteeReport, "C1", { user_id: "S_grp" });
  assert.equal(r.status, 1);
  const d = r.data;
  assert.deepEqual([d.mentee.name, d.mentee.group_name, d.mentee.sub_name], ["Name S_grp", "Sunday Class", "Ladies"]);
  assert.deepEqual([d.reading.list.is_default, d.reading.total, d.reading.completed, d.reading.ongoing], [true, 54, 1, 1]);
  assert.equal(d.reading.levels.length, 3);
  const books = d.reading.levels.flatMap((l) => l.books);
  assert.equal(books.find((b) => b.title === "Elevation to Krishna Consciousness").status, "completed");
  assert.equal(books.find((b) => b.title === "On The Way to Krishna").days, 10); // started 09-29, today 10-09
  assert.equal(books.find((b) => b.title === "Perfection of Yoga").status, "skipped");
  assert.deepEqual(d.reading.own_books, [{ book_id: d.reading.own_books[0].book_id, title: "Grp own book", status: "ongoing" }]);
  assert.deepEqual([d.lectures.last_7_days, d.lectures.total_heard, d.lectures.by_kind], [3, 4, { prabhupada: 2, guru: 1, others: 1 }]);
  assert.deepEqual([d.lectures.recommended_total, d.lectures.recommended_heard], [2, 2]);
  assert.deepEqual(d.lectures.items.map((l) => [l.title, l.heard_on, l.speaker_kind, l.recommended]), [
    ["Rec PB", "2026-10-09", "prabhupada", true],
    ["Rec Guru", "2026-10-05", "guru", true],
    ["Own other", "2026-10-03", "others", false],
    ["Too old", "2026-10-02", "prabhupada", false],
  ]);
});

test("mentee window follows the list the mentee sees (counsellor's own list)", opts, async () => {
  cli(`
    INSERT INTO learning_plans (kind, scope, owner_id) VALUES ('reading', 'all', 'C1');
    SET @p := (SELECT id FROM learning_plans WHERE kind='reading' AND scope='all' AND owner_id='C1');
    INSERT INTO reading_plan_levels (plan_id, name, sort_order) VALUES (@p, 'My level', 1);
    SET @l := (SELECT id FROM reading_plan_levels WHERE plan_id=@p);
    INSERT INTO reading_plan_books (plan_id, level_id, book_id, sort_order) VALUES
      (@p, @l, ${book("Elevation to Krishna Consciousness")}, 1), (@p, @l, ${book("Perfection of Yoga")}, 2);
  `);
  const all = (await call(R.getMenteeReport, "C1", { user_id: "S_prim" })).data; // no group: sees the all-mentees list
  assert.deepEqual([all.reading.list.scope, all.reading.total, all.reading.completed], ["all", 2, 0]);
  const grp = (await call(R.getMenteeReport, "C1", { user_id: "S_all" })).data; // also falls back to it
  assert.equal(grp.reading.total, 2);
});

test("mentee window: only his own mentees; bad input refused", opts, async () => {
  assert.equal((await call(R.getMenteeReport, "C1", { user_id: "S_other" })).code, 404); // C2's mentee
  assert.equal((await call(R.getMenteeReport, "C1", { user_id: "nobody" })).code, 404);
  assert.equal((await call(R.getMenteeReport, "C1", {})).code, 422);
  assert.equal((await call(R.getMenteeReport, "C2", { user_id: "S_other" })).status, 1);
  assert.equal((await call(R.getMenteeReport, "C2", { user_id: "S_grp" })).code, 404);
});

// Runs without a database: the real database can hand back user ids as NUMBERS; the mentee must still be found.
test("mentee window finds a mentee whose id comes back as a number", async () => {
  const stub = {
    query: async (sql) => {
      if (/FROM user_counsellors uc/.test(sql)) return [[{ user_id: 123, name: "Num Mentee", center_id: 5, label_id: null, group_name: "G", sub_name: null }]];
      if (/FROM user_lecture_log/.test(sql) && /GROUP BY/.test(sql)) return [[{ user_id: 123, last7: "2", total: "4" }]];
      return [[]];
    },
  };
  const H = createCounsellorMenteeReportHandlers(stub, { now: () => FIXED_NOW });
  const run = async (handler, query) => { let out; await handler({ user: { user_id: "C1" }, query, body: {} }, { json: (x) => { out = x; } }); return out; };
  const list = await run(H.getMenteesReportList, {});
  assert.equal(list.data.groups[0].subgroups[0].mentees[0].user_id, "123");
  assert.equal(list.data.groups[0].subgroups[0].mentees[0].last_7_days, 2);
  const one = await run(H.getMenteeReport, { user_id: "123" });
  assert.equal(one.status, 1, JSON.stringify(one));
  assert.equal(one.data.mentee.name, "Num Mentee");
});
