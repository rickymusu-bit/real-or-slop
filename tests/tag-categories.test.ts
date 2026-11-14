/** Tag categories (shared/tag-categories.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, categoryError, COLORS, forcedCategory, isCategory, isDecade, limitError, MEDIA, SINGLE, VISUAL } from "../shared/tag-categories";

test("ten fixed categories, Format replaced by Genre, Color and Medium", () => {
  assert.equal(CATEGORIES.length, 10);
  assert.ok(isCategory("genre") && isCategory("color") && isCategory("medium"));
  assert.ok(!isCategory("format") && !isCategory("emotion") && !isCategory(3));
  assert.deepEqual([...SINGLE], ["time", "genre", "color", "medium"]);
  assert.deepEqual([...VISUAL], ["genre", "color", "medium"]);
});
test("Time holds decades only, and decades are Time", () => {
  for (const d of ["1890s", "1970s", "2020s"]) { assert.ok(isDecade(d)); assert.equal(categoryError(d, "time"), ""); }
  for (const d of ["2026", "1975s", "70s", "1970"]) assert.ok(!isDecade(d), d);
  assert.match(categoryError("1970s", "event"), /Tempo/);
  assert.match(categoryError("2026", "time"), /decenni/);
  assert.equal(categoryError("riot", "event"), "");
});
test("Color and Medium accept only their closed lists, and those labels belong to them", () => {
  for (const c of COLORS) { assert.equal(categoryError(c, "color"), ""); assert.equal(forcedCategory(c), "color"); }
  for (const m of MEDIA) { assert.equal(categoryError(m, "medium"), ""); assert.equal(forcedCategory(m), "medium"); }
  assert.match(categoryError("kodachrome", "medium"), /Supporto accetta solo/);
  assert.match(categoryError("teal", "color"), /Colore accetta solo/);
  assert.match(categoryError("newspaper-print", "object"), /Supporto/);
  assert.equal(categoryError("mugshot", "genre"), "");
  assert.equal(forcedCategory("mugshot"), null);
  assert.equal(forcedCategory("1960s"), "time");
});
test("at most one Time, Genre, Color and Medium tag per image", () => {
  assert.equal(limitError(["time", "genre", "color", "medium", "event", "event"]), "");
  assert.match(limitError(["time", "time"]), /Tempo/);
  assert.match(limitError(["genre", "event", "genre"]), /Genere/);
  assert.match(limitError(["color", "color"]), /Colore/);
  assert.match(limitError(["medium", "medium"]), /Supporto/);
});
