import test from "node:test";
import assert from "node:assert/strict";
import { toDateOnly } from "../utils/dateOnly.js";

test("plain date stays as it is", () => assert.equal(toDateOnly("2014-06-15"), "2014-06-15"));
test("the server's own timestamp form (the one that broke edit-profile) becomes a plain date", () => {
  assert.equal(toDateOnly("2014-06-15T00:00:00.000Z"), "2014-06-15");
  assert.equal(toDateOnly("2014-06-15T00:00:00Z"), "2014-06-15");
});
test("other timestamps are read as an India date", () => {
  assert.equal(toDateOnly("2014-06-14T18:30:00.000Z"), "2014-06-15");
  assert.equal(toDateOnly("2014-06-15T10:00:00.000Z"), "2014-06-15");
  assert.equal(toDateOnly(new Date("2014-06-14T18:30:00.000Z")), "2014-06-15");
});
test("empty means no date (null)", () => {
  for (const v of [null, undefined, "", "   "]) assert.equal(toDateOnly(v), null);
});
test("not a real date -> undefined", () => {
  for (const v of ["abc", "15/06/2014", "2014-13-01", "2014-02-30", "2014-06-15Tbad", new Date("x")]) assert.equal(toDateOnly(v), undefined, String(v));
});
