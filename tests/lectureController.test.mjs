// Runs the Lectures endpoints against a THROWAWAY MariaDB (never a real database).
// Skipped unless READING_TEST_SOCKET is set, e.g.
//   READING_TEST_SOCKET=/tmp/rs.sock node --test tests/lectureController.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createLectureHandlers } from "../SadhanaGPT/reading-lecture-feature/LectureStudentController.js";
import { SOCK, cli, fakeDb, call, createBaseDb, dropDb } from "./helpers/throwawayDb.mjs";

const opts = { skip: SOCK ? false : "set READING_TEST_SOCKET to run (needs a throwaway local MariaDB)" };
const FIXED_NOW = Date.parse("2026-10-09T06:00:00Z"); // 2026-10-09 in India
let H;

test.before(() => {
  if (!SOCK) return;
  createBaseDb();
  // system lecture list has 2 lectures; C1 has an "all mentees" lecture list with 1 lecture of his own
  cli(`
    INSERT INTO lectures (title, title_hi, speaker, link, topic) VALUES
      ('BG 2.13 Lecture', 'गीता 2.13 प्रवचन', 'Srila Prabhupada', 'https://example.com/bg-2-13', 'Bhagavad-gita'),
      ('SB 1.2.6 Lecture', NULL, 'Srila Prabhupada', NULL, NULL);
    INSERT INTO lectures (title, speaker, created_by) VALUES ('C1 own lecture', 'Other Speaker', 'C1');
    SET @d := (SELECT id FROM learning_plans WHERE kind='lecture' AND scope='default');
    INSERT INTO lecture_plan_items (plan_id, lecture_id, sort_order)
      SELECT @d, id, 1 FROM lectures WHERE title='BG 2.13 Lecture'
      UNION ALL SELECT @d, id, 2 FROM lectures WHERE title='SB 1.2.6 Lecture';
    INSERT INTO learning_plans (kind, scope, owner_id) VALUES ('lecture','all','C1');
    SET @a := (SELECT id FROM learning_plans WHERE kind='lecture' AND scope='all' AND owner_id='C1');
    INSERT INTO lecture_plan_items (plan_id, lecture_id, sort_order) SELECT @a, id, 1 FROM lectures WHERE title='C1 own lecture';
  `);
  H = createLectureHandlers(fakeDb, { now: () => FIXED_NOW });
});
test.after(() => dropDb());

const titles = (r) => r.data.lectures.map((l) => l.title);

test("not logged in is refused", opts, async () => {
  const r = await call(H.getLecturePlan, null);
  assert.deepEqual([r.status, r.code], [0, 401]);
});

test("default list for a person without a counsellor list; counsellor's list for his mentees; never another counsellor's", opts, async () => {
  const d = await call(H.getLecturePlan, "S_none");
  assert.equal(d.data.plan.scope, "default");
  assert.deepEqual(titles(d), ["BG 2.13 Lecture", "SB 1.2.6 Lecture"]);
  assert.equal(d.data.lectures[0].title_hi, "गीता 2.13 प्रवचन");
  assert.ok(d.data.lectures.every((l) => !l.heard && !l.is_new));
  assert.deepEqual(d.data.summary, { recommended: 2, heard: 0, total_heard: 0 });
  assert.deepEqual(titles(await call(H.getLecturePlan, "S_all")), ["C1 own lecture"]);
  assert.equal((await call(H.getLecturePlan, "S_all")).data.lectures[0].is_new, true); // NEW until heard
  assert.equal((await call(H.getLecturePlan, "S_other")).data.plan.scope, "default");
});

test("mark heard / un-mark; copy of title kept; others unaffected", opts, async () => {
  const lec = (await call(H.getLecturePlan, "S_none")).data.lectures[0];
  let r = await call(H.markHeard, "S_none", { lecture_id: lec.lecture_id });
  assert.deepEqual([r.status, r.data.heard_on], [1, "2026-10-09"]);
  r = await call(H.markHeard, "S_none", { lecture_id: lec.lecture_id, heard_on: "2026-10-01" }); // again: just changes the date
  assert.equal(r.data.heard_on, "2026-10-01");
  let p = (await call(H.getLecturePlan, "S_none")).data;
  assert.deepEqual([p.lectures[0].heard, p.lectures[0].heard_on], [true, "2026-10-01"]);
  assert.deepEqual(p.summary, { recommended: 2, heard: 1, total_heard: 1 });
  assert.deepEqual([p.log.length, p.log[0].title, p.log[0].is_custom], [1, "BG 2.13 Lecture", false]);
  assert.equal((await call(H.getLecturePlan, "S_prim")).data.summary.total_heard, 0);
  r = await call(H.unmarkHeard, "S_none", { lecture_id: lec.lecture_id });
  assert.equal(r.status, 1);
  p = (await call(H.getLecturePlan, "S_none")).data;
  assert.deepEqual([p.lectures[0].heard, p.log.length], [false, 0]);
});

test("mark heard: refusals", opts, async () => {
  const lec = (await call(H.getLecturePlan, "S_none")).data.lectures[0];
  for (const body of [{}, { lecture_id: "x" }, { lecture_id: lec.lecture_id, heard_on: "2026-10-10" }, { lecture_id: lec.lecture_id, heard_on: "bad" }]) {
    const r = await call(H.markHeard, "S_none", body);
    assert.deepEqual([r.status, r.code], [0, 422], JSON.stringify(body));
  }
  assert.equal((await call(H.markHeard, "S_none", { lecture_id: 999999 })).code, 404);
  // C1's own lecture is only in C1's list: a mentee of another counsellor cannot tick it, a mentee of C1 can
  const c1 = (await call(H.getLecturePlan, "S_all")).data.lectures[0].lecture_id;
  assert.equal((await call(H.markHeard, "S_other", { lecture_id: c1 })).code, 403);
  assert.equal((await call(H.markHeard, "S_all", { lecture_id: c1 })).status, 1);
  assert.equal((await call(H.getLecturePlan, "S_all")).data.lectures[0].is_new, false);
});

test("add my own lecture: speaker defaults, shows in my log only, duplicate refused, bad input refused, can remove", opts, async () => {
  let r = await call(H.addMyLecture, "S_none", { title: "  My   Seminar ", link: "https://example.com/x" });
  assert.equal(r.status, 1);
  assert.deepEqual([r.data.title, r.data.speaker, r.data.heard_on, r.data.is_custom], ["My Seminar", "Srila Prabhupada", "2026-10-09", true]);
  const id = r.data.log_id;
  const log = (await call(H.getLecturePlan, "S_none")).data.log;
  assert.deepEqual(log.map((x) => [x.title, x.is_custom]), [["My Seminar", true]]);
  assert.equal((await call(H.getLecturePlan, "S_prim")).data.log.length, 0);
  assert.equal((await call(H.addMyLecture, "S_none", { title: "my seminar", link: "https://example.com/x" })).code, 409);
  assert.equal((await call(H.addMyLecture, "S_none", { title: "my seminar", link: "https://example.com/other" })).status, 1); // different link = different lecture
  assert.equal((await call(H.addMyLecture, "S_none", { title: "" })).code, 422);
  assert.equal((await call(H.addMyLecture, "S_none", { title: "T", link: "javascript:alert(1)" })).code, 422);
  assert.equal((await call(H.addMyLecture, "S_none", { title: "T", heard_on: "2026-12-01" })).code, 422);
  r = await call(H.addMyLecture, "S_none", { title: "Hindi लेक्चर", speaker: "Guest Speaker", heard_on: "2026-09-20" });
  assert.deepEqual([r.data.title, r.data.speaker, r.data.heard_on], ["Hindi लेक्चर", "Guest Speaker", "2026-09-20"]);
  // newest heard date first
  assert.equal((await call(H.getLecturePlan, "S_none")).data.log[0].heard_on, "2026-10-09");
  // only the owner can remove it
  assert.equal((await call(H.removeMyLecture, "S_prim", { log_id: id })).code, 404);
  assert.equal((await call(H.removeMyLecture, "S_none", { log_id: id })).status, 1);
  assert.equal((await call(H.removeMyLecture, "S_none", { log_id: id })).code, 404);
});

test("remove-my-lecture does not remove a ticked recommended lecture (use un-mark for that)", opts, async () => {
  const lec = (await call(H.getLecturePlan, "S_none")).data.lectures[1];
  await call(H.markHeard, "S_none", { lecture_id: lec.lecture_id });
  const logId = (await call(H.getLecturePlan, "S_none")).data.log.find((l) => l.lecture_id === lec.lecture_id).log_id;
  assert.equal((await call(H.removeMyLecture, "S_none", { log_id: logId })).code, 404);
  assert.equal((await call(H.getLecturePlan, "S_none")).data.lectures[1].heard, true);
});
