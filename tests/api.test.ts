import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";
import { DemoStore } from "../worker/storage.ts";
import type { Env } from "../worker/core.ts";
const env = {
  DATA_MODE: "demo",
  ASSETS: { fetch: async () => new Response("app") },
} as unknown as Env;
test("unknown API never falls back to SPA", async () => {
  const r = await worker.fetch(new Request("https://test/api/missing"), env);
  assert.equal(r.status, 404);
  assert.match(r.headers.get("content-type")!, /json/);
});
test("admin route and API are protected server-side", async () => {
  for (const path of ["/admin", "/api/admin"])
    assert.equal(
      (await worker.fetch(new Request("https://test" + path), env)).status,
      503,
    );
});
test("health declares demo", async () => {
  assert.equal(
    (
      await (
        await worker.fetch(new Request("https://test/api/health"), env)
      ).json()
    ).demo,
    true,
  );
});
test("cross-origin mutations denied", async () => {
  const r = await worker.fetch(
    new Request("https://test/api/admin", {
      method: "POST",
      headers: { Origin: "https://other" },
    }),
    env,
  );
  assert.equal(r.status, 403);
});
test("synthetic objects contain no label or metadata", async () => {
  const r = await new DemoStore().get("opaque");
  assert.doesNotMatch(await r.text(), /REAL|AI|title|metadata/);
});
