// Runs the counsellor Lectures endpoints against a THROWAWAY MariaDB (never a real database).
// Skipped unless READING_TEST_SOCKET is set, e.g.
//   READING_TEST_SOCKET=/tmp/rs.sock node --test tests/counsellorLectures.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createLectureHandlers } from "../SadhanaGPT/reading-lecture-feature/LectureStudentController.js";
import { createCounsellorLectureHandlers } from "../SadhanaGPT/reading-lecture-feature/CounsellorLectureController.js";
import { SOCK, cli, fakeDb, call, createBaseDb, dropDb } from "./helpers/throwawayDb.mjs";

const opts = { skip: SOCK ? false : "set READING_TEST_SOCKET to run (needs a throwaway local MariaDB)" };
const FIXED_NOW = Date.parse("2026-10-09T06:00:00Z");
let S, C;

test.before(() => {
  if (!SOCK) return;
  createBaseDb();
  cli(`
    INSERT INTO lectures (title, speaker, link) VALUES ('System lecture A', 'Srila Prabhupada', 'https://example.com/a'), ('System lecture B', 'Srila Prabhupada', NULL);
    SET @d := (SELECT id FROM learning_plans WHERE kind='lecture' AND scope='default');
    INSERT INTO lecture_plan_items (plan_id, lecture_id, sort_order) SELECT @d, id, id FROM lectures;
  `);
  S = createLectureHandlers(fakeDb, { now: () => FIXED_NOW });
  C = createCounsellorLectureHandlers(fakeDb);
});
test.after(() => dropDb());

const seen = async (student) => (await call(S.getLecturePlan, student)).data;
const titles = (d) => d.lectures.map((l) => l.title);

test("not logged in is refused; other counsellor's group refused", opts, async () => {
  assert.equal((await call(C.getScopePlan, null)).code, 401);
  assert.equal((await call(C.getScopePlan, "C1", { group_id: 11 })).code, 403);
  assert.equal((await call(C.getScopePlan, "C2", { group_id: 5 })).code, 403);
  assert.equal((await call(C.getMenteesLectures, "C2", { group_id: 5 })).code, 403);
});

test("before any change: the editor shows the system list", opts, async () => {
  const r = (await call(C.getScopePlan, "C1", { group_id: 5 })).data;
  assert.deepEqual([r.is_custom, r.in_effect, r.lectures.map((l) => l.title)], [false, "default", ["System lecture A", "System lecture B"]]);
  assert.equal(r.library.length, 2);
});

test("save a list (like an uploaded sheet): mentees of the group see it in order; only new rows are NEW", opts, async () => {
  const sysA = (await call(C.getScopePlan, "C1", {})).data.lectures[0];
  const r = await call(C.savePlan, "C1", { group_id: 5, lectures: [
    { title: "  Sheet   lecture 1 ", speaker: "Guest", link: "https://example.com/1", title_hi: "शीट 1" },
    { lecture_id: sysA.lecture_id },
    { title: "Sheet lecture 2" },
  ] });
  assert.deepEqual([r.status, r.data.lectures], [1, 3]);
  const s = await seen("S_grp");
  assert.equal(s.plan.scope, "group");
  assert.deepEqual(titles(s), ["Sheet lecture 1", "System lecture A", "Sheet lecture 2"]);
  assert.deepEqual(s.lectures.map((l) => l.is_new), [true, false, true]);
  assert.deepEqual([s.lectures[0].speaker, s.lectures[0].title_hi, s.lectures[2].speaker], ["Guest", "शीट 1", "Srila Prabhupada"]);
  assert.equal((await seen("S_sub")).plan.scope, "group");
  assert.equal((await seen("S_all")).plan.scope, "default");
  assert.equal((await seen("S_other")).plan.scope, "default");
  const sc = (await call(C.getScopePlan, "C1", { group_id: 5 })).data;
  assert.deepEqual([sc.is_custom, sc.in_effect], [true, "group"]);
});

test("saving again reuses his lecture with the same title + link and keeps its date", opts, async () => {
  const before = (await call(C.getScopePlan, "C1", { group_id: 5 })).data.lectures;
  const r = await call(C.savePlan, "C1", { group_id: 5, lectures: [
    { title: "sheet lecture 2" }, { title: "Sheet lecture 1", link: "https://example.com/1" }, { lecture_id: before[1].lecture_id }, { title: "Brand new" },
  ] });
  assert.equal(r.status, 1);
  const s = await seen("S_grp");
  assert.deepEqual(titles(s), ["Sheet lecture 2", "Sheet lecture 1", "System lecture A", "Brand new"]);
  assert.equal(s.lectures[0].lecture_id, before[2].lecture_id, "reused, not duplicated");
  // his lectures: the two reused ones + "Brand new" = 3 (nothing duplicated)
  const count = Number(cli(`SELECT COUNT(*) FROM lectures WHERE created_by='C1'`).trim().split("\n")[1]);
  assert.equal(count, 3);
  // the same title WITHOUT the link is a different lecture, so it is added as a new one
  await call(C.savePlan, "C1", { group_id: 5, lectures: [{ title: "Sheet lecture 1" }] });
  assert.equal(Number(cli(`SELECT COUNT(*) FROM lectures WHERE created_by='C1'`).trim().split("\n")[1]), 4);
  await call(C.savePlan, "C1", { group_id: 5, lectures: [ // put the 4-lecture list back for the next tests
    { title: "sheet lecture 2" }, { title: "Sheet lecture 1", link: "https://example.com/1" }, { lecture_id: before[1].lecture_id }, { title: "Brand new" }] });
});

test("save-plan refusals", opts, async () => {
  cli(`INSERT INTO lectures (title, created_by) VALUES ('C2 private lecture', 'C2');`);
  const c2 = Number(cli(`SELECT id FROM lectures WHERE title='C2 private lecture'`).trim().split("\n")[1]);
  const cases = [
    [{ group_id: 5 }, 422], [{ group_id: 5, lectures: [] }, 422],
    [{ group_id: 5, lectures: [{ title: "" }] }, 422], [{ group_id: 5, lectures: [{ title: "x", link: "javascript:1" }] }, 422],
    [{ group_id: 5, lectures: [{ title: "x", speaker: "s".repeat(151) }] }, 422],
    [{ group_id: 5, lectures: [{ title: "Same" }, { title: "same" }] }, 422],
    [{ group_id: 5, lectures: [{ lecture_id: c2 }] }, 422], [{ group_id: 5, lectures: [{ lecture_id: 999999 }] }, 422],
    [{ group_id: 5, lectures: [{ lecture_id: 1 }, { lecture_id: 1 }] }, 422],
    [{ group_id: 11, lectures: [{ title: "x" }] }, 403],
  ];
  for (const [body, code] of cases) {
    const r = await call(C.savePlan, "C1", body);
    assert.deepEqual([r.status, r.code], [0, code], JSON.stringify(body).slice(0, 100));
  }
  assert.equal((await seen("S_grp")).lectures.length, 4); // unchanged
});

test("sub-group list wins; reset goes back a step; default list intact", opts, async () => {
  await call(C.savePlan, "C1", { sub_id: 9, lectures: [{ title: "Youth only" }] });
  assert.deepEqual(titles(await seen("S_sub")), ["Youth only"]);
  assert.equal((await seen("S_grp")).lectures.length, 4);
  await call(C.savePlan, "C1", { lectures: [{ title: "For everyone" }] });
  assert.deepEqual(titles(await seen("S_all")), ["For everyone"]);
  let r = await call(C.resetPlan, "C1", { sub_id: 9 });
  assert.deepEqual([r.status, r.data.reset], [1, true]);
  assert.equal((await seen("S_sub")).lectures.length, 4);
  await call(C.resetPlan, "C1", { group_id: 5 });
  assert.deepEqual(titles(await seen("S_grp")), ["For everyone"]);
  assert.equal((await call(C.resetPlan, "C1", { group_id: 5 })).data.reset, false);
  assert.equal((await call(C.resetPlan, "C1", { group_id: 11 })).code, 403);
  await call(C.resetPlan, "C1", {});
  assert.deepEqual(titles(await seen("S_none")), ["System lecture A", "System lecture B"]);
});

test("mentees' lectures: only his own mentees, newest first, recommended vs own", opts, async () => {
  const rec = (await seen("S_none")).lectures; // system A, B
  await call(S.markHeard, "S_grp", { lecture_id: rec[0].lecture_id, heard_on: "2026-10-02" });
  await call(S.addMyLecture, "S_grp", { title: "Their own lecture", heard_on: "2026-10-07" });
  await call(S.addMyLecture, "S_other", { title: "C2 mentee lecture" });
  const r = (await call(C.getMenteesLectures, "C1", { group_id: 5 })).data;
  assert.deepEqual([r.mentee_count, r.recommended_total], [2, 2]);
  const grp = r.mentees.find((m) => m.user_id === "S_grp");
  assert.deepEqual([grp.total_heard, grp.recommended_heard, grp.last_heard_on], [2, 1, "2026-10-07"]);
  assert.deepEqual(grp.lectures.map((l) => [l.title, l.is_custom]), [["Their own lecture", true], ["System lecture A", false]]);
  assert.equal(r.mentees.find((m) => m.user_id === "S_sub").total_heard, 0);
  assert.deepEqual((await call(C.getMenteesLectures, "C1", {})).data.mentees.map((m) => m.user_id).sort(), ["S_all", "S_grp", "S_prim", "S_sub"]);
  assert.deepEqual((await call(C.getMenteesLectures, "C2", {})).data.mentees.map((m) => [m.user_id, m.total_heard]), [["S_other", 1]]);
});
