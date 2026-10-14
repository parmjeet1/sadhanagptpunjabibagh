// Run with:  node --test tests/
// Uses only Node's built-in test runner (no packages to install).
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDatePhrase, extractDatePhrase, sanitizeTargetDate } from "../utils/assistantDate.js";

// A fixed "now": Wednesday 7 Oct 2026, 10:00 IST.
const NOW = new Date("2026-10-07T10:00:00+05:30");
// Another fixed "now" just after New Year: Saturday 2 Jan 2027.
const JAN = new Date("2027-01-02T10:00:00+05:30");
const d = (t, now = NOW) => extractDatePhrase(t, now);

const cases = [
  // ---- relative days: English
  ["today chanting 16", "2026-10-07"], ["yesterday chanting 12", "2026-10-06"], ["y'day chanting 12", "2026-10-06"],
  ["last night slept at 10", "2026-10-06"], ["day before yesterday chanting 8", "2026-10-05"],
  ["2 days ago chanting 10", "2026-10-05"], ["3 days ago chanting 10", "2026-10-04"], ["two days ago reading", "2026-10-05"],
  ["10 days ago chanting 10", "2026-09-27"], ["chanting 16", null],
  // ---- relative days: Hinglish
  ["aaj 16 round", "2026-10-07"], ["kal chanting 16 mala", "2026-10-06"], ["KAL 16", "2026-10-06"], ["Kal ki chanting 16", "2026-10-06"],
  ["parso chanting 14 round", "2026-10-05"], ["2 din pehle 16 round", "2026-10-05"], ["do din pehle 16 round", "2026-10-05"],
  ["3 din pehle chanting 9:30 baje khatam hua", "2026-10-04"], ["teen din pehle", "2026-10-04"], ["5 din pehle", "2026-10-02"],
  ["chanting 16 (kal)", "2026-10-06"], ["kal-kal", "2026-10-06"],
  // ---- relative days: Devanagari
  ["आज 16 माला जप किया", "2026-10-07"], ["कल 12 राउंड चैंटिंग", "2026-10-06"], ["परसों 14 माला", "2026-10-05"],
  ["३ दिन पहले 10 माला", "2026-10-04"], ["कल रात 10 बजे सोया", "2026-10-06"],
  // ---- words that merely contain "kal"
  ["kalpana 16 chanting", null], ["abhi tak 16 round", "2026-10-07"],
  // ---- explicit dates
  ["chanting 16 on 22 sep", "2026-09-22"], ["chanting 16 on 22/09", "2026-09-22"], ["chanting 16 on 22/9", "2026-09-22"],
  ["chanting 16 on 05/10", "2026-10-05"], ["chanting 16 on 2026-09-22", "2026-09-22"], ["2026-9-2 chanting", "2026-09-02"],
  ["chanting 16 on 22 september", "2026-09-22"], ["chanting 16 on sept 22", "2026-09-22"], ["chanting 5th oct", "2026-10-05"],
  ["chanting oct 5th", "2026-10-05"], ["22nd sep chanting 16", "2026-09-22"], ["22-09-2026 chanting", "2026-09-22"],
  ["22.09.2026 chanting", "2026-09-22"], ["22/09/26 chanting", "2026-09-22"], ["chanting 16 on 22-09", "2026-09-22"],
  ["on 5 oct 2025 chanting", "2025-10-05"], ["5 oct 2025", "2025-10-05"], ["22 sep, 2025", "2025-09-22"],
  // ---- fractions, ranges, times and quantities are NOT dates
  ["hearing 1/2 hour", null], ["hearing 1/2 ghanta", null], ["hearing 3/4 hour", null], ["reading 2-3 hours", null],
  ["chanting 5-6 rounds", null], ["slept 5-6 hours", null], ["10-12 rounds", null], ["hearing 30-40 min", null],
  ["woke at 4.30", null], ["woke at 4:30", null], ["chanting 16 rounds 3 baje", null], ["hearing 30 min 16 mar", "2026-03-16"],
  ["chanting 16 rounds, 5th round at 6", null],
  // ---- impossible or future dates are ignored
  ["chanting 31/02", null], ["chanting 45/13", null], ["chanting 16 on 8 oct", "2025-10-08"], ["chanting 16 on 2027-01-01", null],
  // ---- weekdays (Wednesday today)
  ["monday chanting 16", "2026-10-05"], ["somvar chanting 16", "2026-10-05"], ["pichle somvar 16 round", "2026-10-05"],
  ["last wednesday chanting", "2026-09-30"], ["wednesday chanting", "2026-10-07"], ["friday 16 mala", "2026-10-02"],
  ["सोमवार 16 माला", "2026-10-05"], ["mangal aarti attended", null], ["I sat for 20 min", null],
  // ---- the same day named twice is fine
  ["aaj 16 round, aaj reading 20 min", "2026-10-07"], ["kal 16 round, yesterday reading 20", "2026-10-06"],
];
for (const [text, want] of cases) {
  test(`date: ${JSON.stringify(text)} -> ${want}`, () => assert.equal(d(text), want));
}

test('"kal ... aaj ..." is ambiguous and gives no date', () => {
  const r = analyzeDatePhrase("sorry kal nahi kar paya, aaj 16 round chanting", NOW);
  assert.equal(r.date, null);
  assert.equal(r.ambiguous, true);
});
test("two different explicit dates are ambiguous", () => {
  const r = analyzeDatePhrase("chanting 16 on 22 sep and reading 20 on 23 sep", NOW);
  assert.equal(r.ambiguous, true);
});
test("a future explicit year is ambiguous, not silently moved", () => {
  const r = analyzeDatePhrase("chanting 16 on 2027-01-01", NOW);
  assert.equal(r.date, null);
  assert.equal(r.ambiguous, true);
});

// ---- the new-year boundary
test("28 dec said on 2 Jan means last December", () => assert.equal(d("28 dec chanting 16", JAN), "2026-12-28"));
test("30/12 said on 2 Jan means last December", () => assert.equal(d("chanting 16 on 30/12", JAN), "2026-12-30"));
test("31 dec said on 2 Jan", () => assert.equal(d("31 dec", JAN), "2026-12-31"));
test("kal said on 2 Jan", () => assert.equal(d("kal 16 round", JAN), "2027-01-01"));
test("3 days ago said on 2 Jan", () => assert.equal(d("3 days ago", JAN), "2026-12-30"));
test("leap day: 29 feb 2024", () => assert.equal(d("29 feb 2024 chanting", NOW), "2024-02-29"));
test("not a leap year: 29 feb 2026", () => assert.equal(d("29 feb 2026 chanting", NOW), null));

// ---- date words are removed so later parsing never sees their numbers
const cleaned = (t) => analyzeDatePhrase(t, NOW).cleaned;
test("cleaned: 3 days ago is not left as a number", () => assert.equal(cleaned("3 days ago chanting completed at 8:30 am"), "chanting completed at 8:30 am"));
test("cleaned: 3 din pehle", () => assert.equal(cleaned("3 din pehle 16 round"), "16 round"));
test("cleaned: explicit date", () => assert.equal(cleaned("chanting 16 on 22/09 and reading 20 min"), "chanting 16 on and reading 20 min"));
test("cleaned: no date leaves text alone", () => assert.equal(cleaned("chanting 16 rounds"), "chanting 16 rounds"));
test("cleaned: fraction is kept", () => assert.equal(cleaned("hearing 1/2 hour"), "hearing 1/2 hour"));
test("cleaned: Devanagari digits", () => assert.equal(cleaned("३ दिन पहले 10 माला"), "10 माला"));

// ---- dates that come back from the AI
test("sanitizeTargetDate accepts a normal past date", () => assert.equal(sanitizeTargetDate("2026-10-05", NOW), "2026-10-05"));
test("sanitizeTargetDate accepts today", () => assert.equal(sanitizeTargetDate("2026-10-07", NOW), "2026-10-07"));
for (const bad of ["2026-10-08", "2027-01-01", "2026-13-01", "2026-02-30", "garbage", "", null, undefined, 20261005, "2026-10-5", "2020-01-01", "05/10/2026"]) {
  test(`sanitizeTargetDate refuses ${JSON.stringify(bad)}`, () => assert.equal(sanitizeTargetDate(bad, NOW), null));
}

// ---- hostile / huge input stays fast and does not throw
test("100,000 characters of junk is handled quickly", () => {
  const start = Date.now();
  for (const junk of ["1".repeat(100000), "1-".repeat(50000) + "1", "kal ".repeat(25000), "1/2 ".repeat(25000), "9:".repeat(50000), "२".repeat(50000)]) {
    analyzeDatePhrase(junk, NOW);
  }
  assert.ok(Date.now() - start < 3000, "took too long");
});
test("empty and non-text input", () => {
  assert.equal(d(""), null);
  assert.equal(d(null), null);
  assert.equal(d(undefined), null);
  assert.equal(d(12345), null);
});

// ---- misspelled day words (the "Cal ki chanting 3" case)
const typoCases = [
  ["Cal ki chanting 3", "2026-10-06"], ["cal chanting 3", "2026-10-06"], ["kl chanting 3", "2026-10-06"], ["kl ki chanting 3", "2026-10-06"],
  ["caal ki chanting 3", "2026-10-06"], ["kaal ki chanting 3", "2026-10-06"], ["kall 3 round", "2026-10-06"], ["cal ko 16 mala", "2026-10-06"],
  ["yesterdy chanting 12", "2026-10-06"], ["yestarday chanting 12", "2026-10-06"], ["yesturday reading 20 min", "2026-10-06"],
  ["parsso 14 mala", "2026-10-05"], ["paraso 14 mala", "2026-10-05"], ["parsu 14 mala", "2026-10-05"], ["parsoo 14 mala", "2026-10-05"],
  // must NOT be taken as a day
  ["chanting 3 cal", null], ["200 cal burnt chanting 3", null], ["chanting kl 3", null], ["chanting 16 rounds", null],
];
for (const [text, want] of typoCases) {
  test(`typo day word: ${JSON.stringify(text)} -> ${want}`, () => assert.equal(d(text), want));
}
test("a typo day word plus a real one is one day, not ambiguous", () => {
  const r = analyzeDatePhrase("Cal ki chanting 3, kal reading 20 min", NOW);
  assert.equal(r.date, "2026-10-06");
  assert.equal(r.ambiguous, false);
});
