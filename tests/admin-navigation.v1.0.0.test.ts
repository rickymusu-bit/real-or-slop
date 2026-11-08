import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_VIEWS, resolveAdminView } from "../shared/admin-navigation.v1.0.0.ts";

test("admin navigation has six distinct, stable views", () => {
  assert.deepEqual(ADMIN_VIEWS.map(view => view.id),
    ["overview", "topics", "production", "review", "publication", "settings"]);
  assert.equal(new Set(ADMIN_VIEWS.map(view => view.id)).size, 6);
  assert.ok(ADMIN_VIEWS.every(view => view.label.length && view.description.length));
});
test("unknown admin deep links safely return to overview", () => {
  assert.equal(resolveAdminView(null), "overview");
  assert.equal(resolveAdminView("production"), "production");
  assert.equal(resolveAdminView("settings"), "settings");
  assert.equal(resolveAdminView("review"), "review");
  assert.equal(resolveAdminView("unexpected"), "overview");
});
