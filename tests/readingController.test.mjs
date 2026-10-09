// Runs the Reading endpoints against a THROWAWAY MariaDB (never a real database).
// Skipped unless READING_TEST_SOCKET is set to the socket of a disposable local MariaDB server, e.g.
//   READING_TEST_SOCKET=/tmp/rs.sock node --test tests/readingController.test.mjs
// It creates its own temporary database with made-up users, loads DB-PROPOSAL.sql and DB-SEED-DEFAULT.sql, then drops it.
import test from "node:test";
import assert from "node:assert/strict";
import { createReadingHandlers } from "../SadhanaGPT/reading-lecture-feature/ReadingStudentController.js";
import { SOCK, cli, fakeDb, call, createBaseDb, dropDb } from "./helpers/throwawayDb.mjs";

const opts = { skip: SOCK ? false : "set READING_TEST_SOCKET to run (needs a throwaway local MariaDB)" };
let H;
const FIXED_NOW = Date.parse("2026-10-09T06:00:00Z"); // 2026-10-09 in India

test.before(() => {
  if (!SOCK) return;
  createBaseDb();
  // C1's own lists: one for all mentees, one for group 5, one for sub-group 9 (each with one level and one custom book)
  cli(`
    INSERT INTO reading_books (title, created_by) VALUES ('C1 all book','C1'), ('C1 group book','C1'), ('C1 subgroup book','C1');
    INSERT INTO learning_plans (kind, scope, owner_id, center_id, label_id) VALUES
      ('reading','all','C1',NULL,NULL), ('reading','group','C1',5,NULL), ('reading','subgroup','C1',5,9);
    SET @a := (SELECT id FROM learning_plans WHERE scope='all' AND owner_id='C1' AND kind='reading');
    SET @g := (SELECT id FROM learning_plans WHERE scope='group' AND owner_id='C1' AND kind='reading');
    SET @s := (SELECT id FROM learning_plans WHERE scope='subgroup' AND owner_id='C1' AND kind='reading');
    INSERT INTO reading_plan_levels (plan_id, name, sort_order) VALUES (@a,'A-level',1),(@g,'G-level',1),(@s,'S-level',1);
    INSERT INTO reading_plan_books (plan_id, level_id, book_id, sort_order)
      SELECT @a, (SELECT id FROM reading_plan_levels WHERE plan_id=@a), id, 1 FROM reading_books WHERE title='C1 all book'
      UNION ALL SELECT @g, (SELECT id FROM reading_plan_levels WHERE plan_id=@g), id, 1 FROM reading_books WHERE title='C1 group book'
      UNION ALL SELECT @s, (SELECT id FROM reading_plan_levels WHERE plan_id=@s), id, 1 FROM reading_books WHERE title='C1 subgroup book';
  `);
  H = createReadingHandlers(fakeDb, { now: () => FIXED_NOW });
});
test.after(() => dropDb());

const firstBookTitles = (r) => r.data.levels.flatMap((l) => l.books.map((b) => b.title));

test("not logged in is refused", opts, async () => {
  const r = await call(H.getReadingPlan, null);
  assert.equal(r.status, 0); assert.equal(r.code, 401);
});

test("a person with no counsellor gets the system default list (54 books, 22/15/17, Hindi present)", opts, async () => {
  const r = await call(H.getReadingPlan, "S_none");
  assert.equal(r.status, 1);
  assert.equal(r.data.plan.scope, "default");
  assert.deepEqual(r.data.levels.map((l) => l.books.length), [22, 15, 17]);
  assert.equal(r.data.summary.total, 54);
  assert.equal(r.data.summary.not_started, 54);
  const nectar = r.data.levels[0].books.find((b) => b.title === "Nectar of Instruction");
  assert.equal(nectar.title_hi, "उपदेशामृत");
  assert.equal(r.data.levels[0].name_hi, "स्तर 1 — श्रेणी 1");
  assert.ok(r.data.levels.every((l) => l.books.every((b) => b.is_new === false)), "no NEW badge on the system list");
  assert.equal(r.data.levels[0].books[0].title, "Elevation to Krishna Consciousness"); // PDF order kept
});

test("plan choice: sub-group, then group, then all-mentees, then default; own counsellor only", opts, async () => {
  assert.deepEqual(firstBookTitles(await call(H.getReadingPlan, "S_sub")), ["C1 subgroup book"]);
  assert.deepEqual(firstBookTitles(await call(H.getReadingPlan, "S_grp")), ["C1 group book"]);
  assert.deepEqual(firstBookTitles(await call(H.getReadingPlan, "S_all")), ["C1 all book"]);
  // counsellor found through user_counsellors (primary) when the assignment has none
  assert.deepEqual(firstBookTitles(await call(H.getReadingPlan, "S_prim")), ["C1 all book"]);
  // same group/sub-group numbers but a DIFFERENT counsellor: must not see C1's lists
  const other = await call(H.getReadingPlan, "S_other");
  assert.equal(other.data.plan.scope, "default");
});

test("NEW badge shows on a counsellor-made list until the book is started", opts, async () => {
  let r = await call(H.getReadingPlan, "S_all");
  const b = r.data.levels[0].books[0];
  assert.equal(b.is_new, true);
  await call(H.setBookStatus, "S_all", { book_id: b.book_id, status: "ongoing" });
  r = await call(H.getReadingPlan, "S_all");
  assert.equal(r.data.levels[0].books[0].is_new, false);
});

test("status changes: ongoing -> completed -> skipped -> not started, with dates and summary", opts, async () => {
  const plan = await call(H.getReadingPlan, "S_none");
  const gita = plan.data.levels[2].books.find((b) => b.title === "Bhagavad Gita As It Is");
  let r = await call(H.setBookStatus, "S_none", { book_id: gita.book_id, status: "ongoing" });
  assert.deepEqual([r.status, r.data.started_at, r.data.completed_at], [1, "2026-10-09", null]);
  r = await call(H.setBookStatus, "S_none", { book_id: gita.book_id, status: "completed", date: "2026-10-01" });
  assert.deepEqual([r.data.started_at, r.data.completed_at], ["2026-10-01", "2026-10-01"]); // start moved back to the finish date
  const seen = (await call(H.getReadingPlan, "S_none")).data;
  const g = seen.levels[2].books.find((b) => b.title === "Bhagavad Gita As It Is");
  assert.deepEqual([g.status, g.completed_at], ["completed", "2026-10-01"]);
  assert.equal(seen.summary.completed, 1);
  r = await call(H.setBookStatus, "S_none", { book_id: gita.book_id, status: "skipped" });
  assert.equal(r.data.status, "skipped");
  assert.equal((await call(H.getReadingPlan, "S_none")).data.summary.skipped, 1);
  r = await call(H.setBookStatus, "S_none", { book_id: gita.book_id, status: "not_started" });
  assert.equal(r.status, 1);
  assert.equal((await call(H.getReadingPlan, "S_none")).data.summary.not_started, 54);
  // nobody else's progress changed
  assert.equal((await call(H.getReadingPlan, "S_prim")).data.summary.completed, 0);
});

test("bad status requests are refused", opts, async () => {
  const plan = await call(H.getReadingPlan, "S_none");
  const id = plan.data.levels[0].books[0].book_id;
  for (const body of [{}, { book_id: id }, { book_id: id, status: "done" }, { book_id: "abc", status: "ongoing" },
                      { book_id: id, status: "ongoing", date: "2026-10-10" }, { book_id: id, status: "ongoing", date: "09/10/2026" }]) {
    const r = await call(H.setBookStatus, "S_none", body);
    assert.equal(r.status, 0, JSON.stringify(body)); assert.equal(r.code, 422);
  }
  assert.equal((await call(H.setBookStatus, "S_none", { book_id: 999999, status: "ongoing" })).code, 404);
});

test("a person cannot set status on a book that is not in his list (another counsellor's list)", opts, async () => {
  const sub = await call(H.getReadingPlan, "S_sub");
  const id = sub.data.levels[0].books[0].book_id; // only in C1's sub-group list
  assert.equal((await call(H.setBookStatus, "S_other", { book_id: id, status: "ongoing" })).code, 403);
  assert.equal((await call(H.setBookStatus, "S_sub", { book_id: id, status: "ongoing" })).status, 1);
});

test("add my own book: author defaults to Srila Prabhupada, shows only for me, duplicate refused, can remove", opts, async () => {
  let r = await call(H.addMyBook, "S_none", { title: "  My   Extra Book ", link: "https://example.com/b" });
  assert.equal(r.status, 1);
  assert.equal(r.data.author, "Srila Prabhupada"); assert.equal(r.data.status, "ongoing"); assert.equal(r.data.title, "My Extra Book");
  const id = r.data.book_id;
  const mine = (await call(H.getReadingPlan, "S_none")).data.my_books;
  assert.deepEqual(mine.map((b) => [b.title, b.status]), [["My Extra Book", "ongoing"]]);
  assert.equal((await call(H.getReadingPlan, "S_prim")).data.my_books.length, 0);
  assert.equal((await call(H.addMyBook, "S_none", { title: "my extra book" })).code, 409);
  assert.equal((await call(H.addMyBook, "S_none", { title: "X", link: "javascript:alert(1)" })).code, 422);
  assert.equal((await call(H.addMyBook, "S_none", { title: "" })).code, 422);
  assert.equal((await call(H.addMyBook, "S_none", { title: "Y", status: "done" })).code, 422);
  r = await call(H.addMyBook, "S_none", { title: "Planned book", status: "not_started" }); // "not started" is allowed: no status row
  assert.deepEqual([r.status, r.data.status, r.data.started_at], [1, "not_started", null]);
  assert.deepEqual((await call(H.getReadingPlan, "S_none")).data.my_books.map((b) => [b.title, b.status]), [["My Extra Book", "ongoing"], ["Planned book", "not_started"]]);
  assert.equal((await call(H.removeMyBook, "S_none", { book_id: r.data.book_id })).status, 1);
  r = await call(H.addMyBook, "S_none", { title: "Hindi", title_hi: "मेरी पुस्तक", author: "Other Author", status: "completed" });
  assert.deepEqual([r.data.title_hi, r.data.author, r.data.status], ["मेरी पुस्तक", "Other Author", "completed"]);
  // somebody else cannot remove it; I can
  assert.equal((await call(H.removeMyBook, "S_prim", { book_id: id })).code, 404);
  assert.equal((await call(H.removeMyBook, "S_none", { book_id: id })).status, 1);
  assert.equal((await call(H.getReadingPlan, "S_none")).data.my_books.length, 1);
});

test("a system book or a book in a list cannot be removed through remove-my-book", opts, async () => {
  const sys = (await call(H.getReadingPlan, "S_none")).data.levels[0].books[0].book_id;
  assert.equal((await call(H.removeMyBook, "C1", { book_id: sys })).code, 404);
  const c1book = (await call(H.getReadingPlan, "S_all")).data.levels[0].books[0].book_id; // created by C1, sits in C1's list
  const r = await call(H.removeMyBook, "C1", { book_id: c1book });
  assert.equal(r.code, 409);
});
