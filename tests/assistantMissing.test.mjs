// Run with:  node --test "tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { parseSadhna } from "../utils/assistantParser.js";
import { analyzeDatePhrase } from "../utils/assistantDate.js";
import { checkMissingActivities, missingActivityMessage } from "../utils/assistantMissing.js";
import { build, ACTS } from "./helpers/sentenceGenerator.mjs";

const NOW = new Date("2026-10-07T10:00:00+05:30");
const mk = (id, name, type, category) => ({ activity_id: String(id), name, type, category });

// The student in the screenshot: no Study, no Chanting Completion Time, no Sleep... etc.
const SHOT = [
  mk(1, "Chanting", "number", "chanting"), mk(2, "Book Reading", "duration", "reading"), mk(3, "Wakeup time", "time", "wakeup"),
  mk(4, "Day Rest", "duration", "day_rest"), mk(5, "Hearing", "duration", "hearing"), mk(6, "Sleep time", "time", "sleep"),
  mk(7, "Mangal Aarti", "boolean", "mangal_aarti"),
];

const check = (acts, text) => checkMissingActivities(analyzeDatePhrase(text, NOW).cleaned, acts);

test("a student without Study is told so", () => {
  for (const t of ["Study 25 minute", "study 45 min", "adhyayan 30 min", "2 hours study", "aaj 30 min study kiya", "स्टडी 30 मिनट"]) {
    const r = check(SHOT, t);
    assert.ok(r, t);
    assert.deepEqual(r.missing, ["Study"], t);
    assert.equal(r.updates.length, 0, t);
  }
});

test("a student without Chanting Completion Time is told so", () => {
  for (const t of ["Chanting poori Hui 2 baje", "chanting complete 2 baje", "japa 2 baje tak complete", "जप पूरा 9 बजे"]) {
    const r = check(SHOT, t);
    assert.ok(r, t);
    assert.deepEqual(r.missing, ["Chanting Completion Time"], t);
  }
});

test("a mixed message saves what exists and names what is missing", () => {
  const r = check(SHOT, "16 rounds, study 30 min");
  assert.deepEqual(r.missing, ["Study"]);
  assert.deepEqual(r.updates.map((u) => [u.activity_id, u.value]), [["1", 16]]);
  const r2 = check(SHOT, "chanting 16 rounds 2 baje poore hue");
  assert.ok(r2);
});

test("never claims missing when the student has the activity", () => {
  const FULL = [...SHOT, mk(8, "Study (MIN)", "duration", "custom"), mk(9, "Chanting Completion Time", "time", "chanting_completion_time")];
  for (const t of ["study 25 min", "chanting poori hui 2 baje", "hearing 30 min", "16 rounds"]) assert.equal(check(FULL, t), null, t);
  // an activity whose category was guessed oddly but whose NAME is clear
  const ODD = [mk(1, "Chanting", "number", "chanting"), mk(2, "Study Hours(MIN)", "duration", "custom")];
  assert.equal(check(ODD, "study 25 min"), null);
});

test("unsure cases go on to the AI step (null)", () => {
  for (const t of ["study 25 min actually sorry 30", "study", "hello", "study 25 min or 30 min", "kal study 25 min aaj 30 min", "study -5 min", "books distributed 10"]) {
    const r = check(SHOT, t);
    if (r) assert.ok(false, `${t} -> ${JSON.stringify(r)}`);
  }
});

test("generated messages: only ever claims the activity that was really removed", () => {
  const removeAndCheck = (idToRemove, label) => {
    const acts = ACTS.filter((a) => a.activity_id !== idToRemove);
    let claimed = 0, wrong = 0;
    for (const c of build(2000, NOW)) {
      const d = analyzeDatePhrase(c.text, NOW);
      if (d.ambiguous) continue;
      const local = parseSadhna(d.cleaned, acts);
      if (!local.needsAI && local.updates.length) continue; // the fast reader already handled it
      const r = checkMissingActivities(d.cleaned, acts);
      if (!r) continue;
      claimed += 1;
      const ok = r.missing.every((m) => m === label) && Object.keys(c.truth).includes(idToRemove);
      if (!ok) wrong += 1;
    }
    return { claimed, wrong };
  };
  for (const [id, label] of [["10", "Chanting Completion Time"], ["6", "Day Rest"], ["7", "Hearing"], ["2", "Reading"], ["4", "Sleep Time"], ["3", "Wake Up Time"], ["11", "Mangal Aarti"]]) {
    const { claimed, wrong } = removeAndCheck(id, label);
    assert.equal(wrong, 0, `${label}: ${wrong} wrong out of ${claimed}`);
    assert.ok(claimed > 5, `${label}: only ${claimed} caught`);
  }
});

test("the message names the activity and the student's own list", () => {
  const m = missingActivityMessage(["Study"], SHOT);
  assert.match(m, /Study/);
  assert.match(m, /Chanting/);
  assert.match(m, /re-check/);
});
