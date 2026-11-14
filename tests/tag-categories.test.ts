/** Tag categories (shared/tag-categories.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, categoryError, isCategory, isDecade, limitError } from "../shared/tag-categories";

test("eight fixed categories", () => {
  assert.equal(CATEGORIES.length, 8);
  assert.ok(isCategory("format") && !isCategory("emotion") && !isCategory(3));
});
test("Time holds decades only, and decades are Time", () => {
  for (const d of ["1890s", "1970s", "2020s"]) { assert.ok(isDecade(d)); assert.equal(categoryError(d, "time"), ""); }
  for (const d of ["2026", "1975s", "70s", "1970"]) assert.ok(!isDecade(d), d);
  assert.match(categoryError("1970s", "event"), /Tempo/);
  assert.match(categoryError("2026", "time"), /decenni/);
  assert.equal(categoryError("riot", "event"), "");
});
test("at most one Time and one Format tag per image", () => {
  assert.equal(limitError(["time", "format", "event", "event"]), "");
  assert.match(limitError(["time", "time"]), /Tempo/);
  assert.match(limitError(["format", "event", "format"]), /Formato/);
});
