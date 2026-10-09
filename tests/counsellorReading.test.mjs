// Runs the counsellor Reading endpoints against a THROWAWAY MariaDB (never a real database).
// Skipped unless READING_TEST_SOCKET is set, e.g.
//   READING_TEST_SOCKET=/tmp/rs.sock node --test tests/counsellorReading.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createReadingHandlers } from "../SadhanaGPT/reading-lecture-feature/ReadingStudentController.js";
import { createCounsellorReadingHandlers } from "../SadhanaGPT/reading-lecture-feature/CounsellorReadingController.js";
import { SOCK, cli, fakeDb, call, createBaseDb, dropDb } from "./helpers/throwawayDb.mjs";

const opts = { skip: SOCK ? false : "set READING_TEST_SOCKET to run (needs a throwaway local MariaDB)" };
const FIXED_NOW = Date.parse("2026-10-09T06:00:00Z"); // 2026-10-09 in India
let S, C; // student and counsellor handlers

test.before(() => {
  if (!SOCK) return;
  createBaseDb();
  S = createReadingHandlers(fakeDb, { now: () => FIXED_NOW });
  C = createCounsellorReadingHandlers(fakeDb, { now: () => FIXED_NOW });
});
test.after(() => dropDb());

const sysBooks = async () => (await call(C.getScopePlan, "C1", {})).data.levels.flatMap((l) => l.books);
const seen = async (student) => (await call(S.getReadingPlan, student)).data;

test("not logged in is refused", opts, async () => {
  const r = await call(C.getScopes, null);
  assert.deepEqual([r.status, r.code], [0, 401]);
});

test("scopes: his own groups / sub-groups with mentee counts; nobody else's", opts, async () => {
  const r = (await call(C.getScopes, "C1")).data;
  assert.deepEqual([r.all.mentees, r.all.has_custom.reading], [4, false]);
  assert.deepEqual(r.groups.map((g) => [g.group_id, g.name, g.mentees]), [[7, "Weekday Class", 1], [5, "Sunday Class", 2]].sort((a, b) => a[1].localeCompare(b[1])));
  const g5 = r.groups.find((g) => g.group_id === 5);
  assert.deepEqual(g5.subgroups.map((s) => [s.sub_id, s.name, s.mentees]).sort(), [[2, "Ladies", 1], [9, "Youth", 1]]);
  const c2 = (await call(C.getScopes, "C2")).data;
  assert.deepEqual([c2.all.mentees, c2.groups.map((g) => g.group_id)], [1, [11]]);
});

test("scope access: only his own group / sub-group; bad values refused", opts, async () => {
  for (const [who, body, code] of [["C1", { group_id: 11 }, 403], ["C1", { sub_id: 20 }, 403], ["C2", { group_id: 5 }, 403],
                                   ["C1", { group_id: 7, sub_id: 9 }, 422], ["C1", { group_id: "abc" }, 422], ["C1", { sub_id: -1 }, 422]]) {
    const r = await call(C.getScopePlan, who, body);
    assert.deepEqual([r.status, r.code], [0, code], JSON.stringify([who, body]));
  }
  assert.equal((await call(C.getScopePlan, "C1", { group_id: "all", sub_id: "all" })).status, 1);
});

test("before any change the editor shows the default list and the library", opts, async () => {
  const r = (await call(C.getScopePlan, "C1", { group_id: 5 })).data;
  assert.deepEqual([r.is_custom, r.in_effect, r.scope.type], [false, "default", "group"]);
  assert.deepEqual(r.levels.map((l) => l.books.length), [22, 15, 17]);
  assert.equal(r.library.length, 54);
});

test("save a list for a group: mentees of that group see it, others do not; only new books get the NEW badge", opts, async () => {
  const b = await sysBooks();
  const [b1, b2, b3] = b;
  const r = await call(C.savePlan, "C1", { group_id: 5, levels: [
    { name: "Start here", name_hi: "यहाँ से शुरू", books: [{ book_id: b2.book_id }, { title: "  My   Pick ", title_hi: "मेरी पसंद", link: "https://example.com/p" }] },
    { name: "Next", books: [{ book_id: b1.book_id }, { book_id: b3.book_id }] },
  ] });
  assert.deepEqual([r.status, r.data.levels, r.data.books], [1, 2, 4]);
  const s = await seen("S_grp");
  assert.equal(s.plan.scope, "group");
  assert.deepEqual(s.levels.map((l) => [l.name, l.name_hi, l.books.map((x) => x.title)]), [
    ["Start here", "यहाँ से शुरू", [b2.title, "My Pick"]], ["Next", null, [b1.title, b3.title]]]);
  assert.deepEqual(s.levels[0].books.map((x) => x.is_new), [false, true]); // old default book not NEW, brand-new book is
  assert.equal(s.levels[0].books[1].author, "Srila Prabhupada");
  assert.equal((await seen("S_sub")).plan.scope, "group"); // sub-group without its own list uses the group list
  assert.equal((await seen("S_all")).plan.scope, "default"); // other group unaffected
  assert.equal((await seen("S_other")).plan.scope, "default"); // another counsellor's mentee unaffected
  const scopes = (await call(C.getScopes, "C1")).data;
  assert.deepEqual([scopes.groups.find((g) => g.group_id === 5).has_custom.reading, scopes.groups.find((g) => g.group_id === 7).has_custom.reading], [true, false]);
  const ed = (await call(C.getScopePlan, "C1", { group_id: 5 })).data;
  assert.deepEqual([ed.is_custom, ed.in_effect], [true, "group"]);
  assert.equal(ed.library.length, 55); // 54 + his new book
});

test("saving again keeps old books' dates, reuses his book by name, and only newly added books are NEW", opts, async () => {
  const ed = (await call(C.getScopePlan, "C1", { group_id: 5 })).data;
  const pick = ed.levels[0].books[1];
  const extra = (await sysBooks()).find((x) => x.title === "Nectar of Instruction");
  const r = await call(C.savePlan, "C1", { group_id: 5, levels: [
    { name: "All in one", books: [{ title: "my pick" }, { book_id: ed.levels[1].books[0].book_id }, { book_id: extra.book_id }] },
  ] });
  assert.equal(r.status, 1);
  const s = await seen("S_grp");
  assert.deepEqual(s.levels.map((l) => l.books.map((x) => [x.title, x.is_new])), [[["My Pick", true], [ed.levels[1].books[0].title, false], ["Nectar of Instruction", true]]]);
  assert.equal(s.levels[0].books[0].book_id, pick.book_id, "same book reused, no duplicate created");
  const lib = (await call(C.getScopePlan, "C1", { group_id: 5 })).data.library;
  assert.equal(lib.filter((x) => x.title === "My Pick").length, 1);
});

test("save-plan refusals", opts, async () => {
  const b = await sysBooks();
  cli(`INSERT INTO reading_books (title, created_by) VALUES ('C2 private book', 'C2');`);
  const c2id = Number(cli(`SELECT id FROM reading_books WHERE title='C2 private book'`).trim().split("\n")[1]);
  const lv = (books, name = "L") => ({ levels: [{ name, books }] });
  const cases = [
    [{ group_id: 5 }, 422], [{ group_id: 5, levels: [] }, 422], [{ group_id: 5, ...lv([]) }, 422],
    [{ group_id: 5, ...lv([{ book_id: b[0].book_id }, { book_id: b[0].book_id }]) }, 422], // twice
    [{ group_id: 5, ...lv([{ book_id: c2id }]) }, 422], // another counsellor's book
    [{ group_id: 5, ...lv([{ book_id: 999999 }]) }, 422],
    [{ group_id: 5, ...lv([{ title: "X", link: "javascript:1" }]) }, 422],
    [{ group_id: 5, ...lv([{ title: "Same" }, { title: "same" }]) }, 422],
    [{ group_id: 5, ...lv([{ book_id: b[0].book_id }], "  ") }, 422], // level without a name
    [{ group_id: 11, ...lv([{ book_id: b[0].book_id }]) }, 403], // not his group
  ];
  for (const [body, code] of cases) {
    const r = await call(C.savePlan, "C1", body);
    assert.deepEqual([r.status, r.code], [0, code], JSON.stringify(body).slice(0, 120));
  }
  // nothing above changed the list
  assert.equal((await seen("S_grp")).levels.length, 1);
});

test("a sub-group list wins over the group list; reset goes back one step", opts, async () => {
  const b = await sysBooks();
  let r = await call(C.savePlan, "C1", { sub_id: 9, levels: [{ name: "Youth list", books: [{ book_id: b[3].book_id }] }] });
  assert.deepEqual([r.status, r.data.scope], [1, "subgroup"]);
  assert.equal((await seen("S_sub")).levels[0].name, "Youth list"); // sub 9
  assert.equal((await seen("S_grp")).levels[0].name, "All in one"); // sub 2 still the group list
  // an 'all mentees' list is used by mentees with no group/sub-group list (group 7)
  await call(C.savePlan, "C1", { levels: [{ name: "For everyone", books: [{ book_id: b[4].book_id }] }] });
  assert.equal((await seen("S_all")).levels[0].name, "For everyone");
  assert.equal((await seen("S_prim")).levels[0].name, "For everyone");
  assert.equal((await seen("S_grp")).levels[0].name, "All in one"); // group list still wins over 'all'
  // resets
  r = await call(C.resetPlan, "C1", { sub_id: 9 });
  assert.deepEqual([r.status, r.data.reset], [1, true]);
  assert.equal((await seen("S_sub")).levels[0].name, "All in one");
  r = await call(C.resetPlan, "C1", { group_id: 5 });
  assert.equal((await seen("S_grp")).levels[0].name, "For everyone");
  assert.equal((await call(C.resetPlan, "C1", { group_id: 5 })).data.reset, false);
  assert.equal((await call(C.resetPlan, "C1", { group_id: 11 })).code, 403);
  await call(C.resetPlan, "C1", {});
  assert.equal((await seen("S_all")).plan.scope, "default");
  // another counsellor's lists were never touched, and the default list is intact
  assert.equal((await seen("S_none")).summary.total, 54);
});

test("mentees' status: by mentee and by book, only his own mentees", opts, async () => {
  const b = (await seen("S_none")).levels.flatMap((l) => l.books);
  const [x, y, z] = b;
  await call(S.setBookStatus, "S_sub", { book_id: x.book_id, status: "completed", date: "2026-10-01" });
  await call(S.setBookStatus, "S_sub", { book_id: y.book_id, status: "ongoing", date: "2026-09-01" });
  await call(S.setBookStatus, "S_grp", { book_id: x.book_id, status: "ongoing" });
  await call(S.setBookStatus, "S_other", { book_id: x.book_id, status: "completed" }); // C2's mentee
  await call(S.addMyBook, "S_grp", { title: "Their own book", status: "completed" });

  const r = (await call(C.getMenteesStatus, "C1", { group_id: 5 })).data;
  assert.equal(r.mentee_count, 2);
  assert.deepEqual(r.mentees.map((m) => m.user_id).sort(), ["S_grp", "S_sub"]);
  const sub = r.mentees.find((m) => m.user_id === "S_sub");
  assert.deepEqual([sub.completed, sub.reading.length, sub.reading[0].days, sub.longest_ongoing_days], [1, 1, 38, 38]);
  assert.equal(sub.statuses[x.book_id], "completed");
  const grp = r.mentees.find((m) => m.user_id === "S_grp");
  assert.deepEqual([grp.completed, grp.own.map((o) => [o.title, o.status])], [1, [["Their own book", "completed"]]]); // own completed book counts
  const bx = r.books.find((k) => k.book_id === x.book_id);
  assert.deepEqual([bx.completed, bx.ongoing, bx.not_started], [1, 1, 0]);
  assert.equal(r.books.length, 54);
  assert.deepEqual(r.levels.map((l) => l.book_ids.length), [22, 15, 17]);
  // wider and narrower scopes
  assert.equal((await call(C.getMenteesStatus, "C1", {})).data.mentee_count, 4);
  assert.deepEqual((await call(C.getMenteesStatus, "C1", { sub_id: 9 })).data.mentees.map((m) => m.user_id), ["S_sub"]);
  // the other counsellor sees only his own mentee, and cannot ask about C1's group
  assert.deepEqual((await call(C.getMenteesStatus, "C2", {})).data.mentees.map((m) => m.user_id), ["S_other"]);
  assert.equal((await call(C.getMenteesStatus, "C2", { group_id: 5 })).code, 403);
  // a scope with no mentees is fine
  assert.equal((await call(C.getMenteesStatus, "C1", { group_id: 7 })).data.books[0].completed, 0);
});
