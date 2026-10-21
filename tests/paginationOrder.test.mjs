// The mentee list used to sort only by created_at, so students added in the same second could show twice or
// never between pages. getPaginatedData now accepts a tie-breaker that is added to ORDER BY.
import test from "node:test";
import assert from "node:assert/strict";

// utils/dbUtils.js loads the real database pool module. Where the database packages are not installed, skip.
let db = null;
let getPaginatedData = null;
try {
  db = (await import("../config/database.js")).default;
  ({ getPaginatedData } = await import("../utils/dbUtils.js"));
} catch {
  db = null;
}
const skip = db ? false : "database packages are not installed here";

const capture = async (extra) => {
  const seen = [];
  const realExecute = db.execute;
  const realQuery = db.query;
  db.execute = async (sql) => { seen.push(sql); return [[]]; };
  db.query = async () => [[{ total: 0 }]];
  try {
    await getPaginatedData({ tableName: "users us", sortColumn: "us.created_at", sortOrder: "DESC", page_no: 2, limit: 30, ...extra });
  } finally {
    db.execute = realExecute;
    db.query = realQuery;
  }
  return seen[0];
};

test("a tie-breaker is added after the sort column, before LIMIT", { skip }, async () => {
  const sql = await capture({ tieBreaker: "us.user_id DESC" });
  assert.match(sql, /ORDER BY us\.created_at DESC, us\.user_id DESC LIMIT 30, 30/);
});

test("without a tie-breaker the query is exactly as before", { skip }, async () => {
  const sql = await capture({});
  assert.match(sql, /ORDER BY us\.created_at DESC LIMIT 30, 30/);
  assert.doesNotMatch(sql, /ORDER BY[^]*,[^]*LIMIT/);
});
