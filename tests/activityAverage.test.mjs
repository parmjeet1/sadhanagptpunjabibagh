import test from "node:test";
import assert from "node:assert/strict";
import { computeAverageValue } from "../utils/activityAverage.js";

const days = (...c) => c.map((count, i) => ({ activity_date: `2026-10-${10 + i}`, count }));

test("time activity averages as a clock time", () => {
  assert.equal(computeAverageValue("time", days("05:00:00", "06:00:00")), "5:30 AM");
  assert.equal(computeAverageValue("time", days("13:00:00", "14:30:00")), "1:45 PM");
});
test("empty days are ignored for time activities", () => {
  assert.equal(computeAverageValue("time", days("05:00:00", 0, "00:00:00", "07:00:00")), "6:00 AM");
});
test("times either side of midnight do not average to noon", () => {
  assert.equal(computeAverageValue("time", days("23:00:00", "01:00:00")), "12:00 AM");
});
test("AM/PM text is understood", () => {
  assert.equal(computeAverageValue("time", days("5:00 AM", "7:00 AM")), "6:00 AM");
});
test("no entries gives 0", () => {
  assert.equal(computeAverageValue("time", days(0, 0)), 0);
  assert.equal(computeAverageValue("numb", days(0, 0)), 0);
});
test("number activities: total over all days in the period", () => {
  assert.equal(computeAverageValue("numb", days(16, 0, 16, 0)), 8);
  assert.equal(computeAverageValue("min", days("10", 0, 5)), 5);
});
