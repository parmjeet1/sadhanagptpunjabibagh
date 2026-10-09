// Tests for the small helpers of the Reading + Lectures feature (no database needed).
import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidBookStatus, cleanText, cleanLink, todayIST, isRealDate, statusDates, summarize,
} from "../SadhanaGPT/reading-lecture-feature/readingRules.js";

test("book statuses", () => {
  for (const s of ["not_started", "ongoing", "completed", "skipped"]) assert.ok(isValidBookStatus(s));
  for (const s of ["done", "", null, undefined, "Completed"]) assert.equal(isValidBookStatus(s), false);
});

test("cleanText trims, collapses spaces, and flags too-long text", () => {
  assert.equal(cleanText("  Bhagavad   Gita \n", 50), "Bhagavad Gita");
  assert.equal(cleanText("   ", 50), null);
  assert.equal(cleanText(undefined, 50), null);
  assert.equal(cleanText("a".repeat(11), 10), undefined);
  assert.equal(cleanText("a".repeat(10), 10), "a".repeat(10));
  assert.equal(cleanText("श्रीमद्भागवतम्", 50), "श्रीमद्भागवतम्");
});

test("cleanLink accepts only normal http(s) links", () => {
  assert.equal(cleanLink(""), null);
  assert.equal(cleanLink(undefined), null);
  assert.equal(cleanLink(" https://vedabase.io/en/library/bg/ "), "https://vedabase.io/en/library/bg/");
  assert.equal(cleanLink("http://a.com/x?y=1#z"), "http://a.com/x?y=1#z");
  for (const bad of ["javascript:alert(1)", "ftp://a.com", "vedabase.io", "https://", "https://a b.com", "data:text/html,hi", "https://a.com/" + "x".repeat(500)])
    assert.equal(cleanLink(bad), undefined, bad);
});

test("todayIST rolls over at 18:30 UTC", () => {
  assert.equal(todayIST(Date.parse("2026-10-09T18:29:00Z")), "2026-10-09");
  assert.equal(todayIST(Date.parse("2026-10-09T18:30:00Z")), "2026-10-10");
});

test("isRealDate", () => {
  assert.ok(isRealDate("2026-10-09"));
  for (const bad of ["2026-02-30", "2026-13-01", "09-10-2026", "2026-1-1", "", null, 20261009]) assert.equal(isRealDate(bad), false, String(bad));
});

test("statusDates", () => {
  const T = "2026-10-09";
  assert.deepEqual(statusDates("ongoing", null, T), { started_at: T, completed_at: null });
  assert.deepEqual(statusDates("ongoing", { status: "completed", started_at: "2026-09-01", completed_at: "2026-10-01" }, T),
    { started_at: "2026-09-01", completed_at: null });
  assert.deepEqual(statusDates("completed", null, T), { started_at: T, completed_at: T });
  assert.deepEqual(statusDates("completed", { status: "ongoing", started_at: "2026-09-01", completed_at: null }, T),
    { started_at: "2026-09-01", completed_at: T });
  // completing again keeps the first completion date
  assert.deepEqual(statusDates("completed", { status: "completed", started_at: "2026-09-01", completed_at: "2026-09-20" }, T),
    { started_at: "2026-09-01", completed_at: "2026-09-20" });
  // finishing on a date before the recorded start moves the start back (start is never after finish)
  assert.deepEqual(statusDates("completed", { status: "ongoing", started_at: "2026-10-09", completed_at: null }, T, "2026-10-01"),
    { started_at: "2026-10-01", completed_at: "2026-10-01" });
  // a date the person gives wins
  assert.deepEqual(statusDates("completed", null, T, "2026-08-15"), { started_at: "2026-08-15", completed_at: "2026-08-15" });
  assert.deepEqual(statusDates("ongoing", null, T, "2026-08-15"), { started_at: "2026-08-15", completed_at: null });
  assert.deepEqual(statusDates("skipped", { status: "ongoing", started_at: "2026-09-01", completed_at: null }, T),
    { started_at: "2026-09-01", completed_at: null });
  assert.deepEqual(statusDates("not_started", { status: "ongoing", started_at: "2026-09-01" }, T), { started_at: null, completed_at: null });
});

test("summarize counts every status, empty status = not started", () => {
  assert.deepEqual(
    summarize([{ status: "completed" }, { status: "ongoing" }, { status: "skipped" }, { status: "not_started" }, { status: null }, {}]),
    { total: 6, completed: 1, ongoing: 1, skipped: 1, not_started: 3 });
  assert.deepEqual(summarize([]), { total: 0, completed: 0, ongoing: 0, skipped: 0, not_started: 0 });
});
