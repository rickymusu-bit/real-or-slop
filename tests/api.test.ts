/** Worker routing on the current schema: unknown and removed APIs answer 404. */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";
import type { Env } from "../worker/core.ts";
const env = { ASSETS: { fetch: async () => new Response("app") } } as unknown as Env;
test("unknown API never falls back to SPA", async () => {
  const r = await worker.fetch(new Request("https://test/api/missing"), env);
  assert.equal(r.status, 404);
  assert.match(r.headers.get("content-type")!, /json/);
});
test("admin page and library API are protected server-side", async () => {
  for (const path of ["/admin", "/api/admin", "/api/admin/library", "/api/admin/library/fixture/file", "/api/admin/library/tags"])
    assert.equal((await worker.fetch(new Request("https://test" + path), env)).status, 503);
  const token = "fixture-owner-admin-token-32-characters";
  assert.equal((await worker.fetch(new Request("https://test/api/admin/library"), { ...env, ADMIN_TOKEN: token })).status, 401);
});
test("retired admin APIs are gone", async () => {
  const token = "fixture-owner-admin-token-32-characters";
  for (const path of ["/api/admin/review-inbox", "/api/admin/editorial/workspace", "/api/admin/similarity", "/api/admin/stats"])
    assert.equal((await worker.fetch(new Request("https://test" + path, { headers: { Authorization: "Bearer " + token } }), { ...env, ADMIN_TOKEN: token })).status, 404);
  assert.equal((await worker.fetch(new Request("https://test/api/categories"), env)).status, 404);
});
test("health answers without catalog modes", async () => {
  assert.deepEqual(await (await worker.fetch(new Request("https://test/api/health"), env)).json(), { name: "Real or Slop" });
});
test("cross-origin mutations denied", async () => {
  const r = await worker.fetch(new Request("https://test/api/admin", { method: "POST", headers: { Origin: "https://other" } }), env);
  assert.equal(r.status, 403);
});
test("the removed PvP API does not exist", async () => {
  for (const path of ["/api/rooms", "/api/rooms/ABCDEFGHJKLM/join", "/api/rooms/ABCDEFGHJKLM/ws", "/api/rooms/ABCDEFGHJKLM/state"])
    assert.equal((await worker.fetch(new Request("https://test" + path), env)).status, 404);
});
