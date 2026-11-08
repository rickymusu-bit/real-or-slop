import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog, currentGameMode, HttpError, type Env } from "../worker/core.ts";
import { gameCatalogModeAdmin } from "../worker/game-catalog-mode.v1.0.0.ts";
import { media } from "../worker/storage.ts";
import worker from "../worker/index.ts";

type Mode = "demo" | "production";
function fixture(real: number, ai: number, initial: Mode = "demo", storage = true) {
  const control = { mode: initial, revision: 0, updated_at: "2026-11-08T00:00:00Z" };
  const audit: { revision: number; previous: Mode; mode: Mode }[] = [];
  const database = {
    prepare(sql: string) {
      const stmt = {
        sql, args: [] as unknown[],
        bind(...args: unknown[]) { this.args = args; return this; },
        async first() {
          if (sql.includes("FROM game_catalog_control")) return { ...control };
          return null;
        },
        async all() {
          if (sql.includes("i.type,count(*) AS total"))
            return { results: [{ type: "REAL", total: real }, { type: "AI", total: ai }] };
          if (sql.includes("SELECT i.* FROM images"))
            return { results: [{ id: "fixture", type: "REAL", demo: this.args[0], status: "approved" }] };
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(statements: { sql: string; args: unknown[] }[]) {
      const result = [];
      for (const stmt of statements) {
        if (stmt.sql.startsWith("UPDATE game_catalog_control")) {
          const [desired, stamp, expected] = stmt.args as [Mode,string,number];
          const allowed = desired === "demo" || (storage && real > 0 && ai > 0);
          const changes = control.revision === expected && control.mode !== desired && allowed ? 1 : 0;
          if (changes) { control.mode = desired; control.revision++; control.updated_at = stamp; }
          result.push({ meta: { changes } });
        } else {
          const [, previous, desired, , , , revision] = stmt.args as [string,Mode,Mode,string,string,Mode,number];
          const changes = control.mode === desired && control.revision === revision ? 1 : 0;
          if (changes) audit.push({ revision, previous, mode: desired });
          result.push({ meta: { changes } });
        }
      }
      return result;
    },
  };
  const env = {
    DB: database, DATA_MODE: "demo", ADMIN_TOKEN: "fixture-admin-authorization-token-0001",
    IMAGES: storage ? { get: async () => null } : undefined,
    ASSETS: { fetch: async () => new Response("app") },
  } as unknown as Env;
  return { env, control, audit };
}
function change(mode: Mode, revision: number) {
  return new Request("https://test/api/admin/game-catalog-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, revision, confirm: true }),
  });
}
test("catalog selection uses persisted mode, not Wrangler DATA_MODE", async () => {
  const f = fixture(2, 2, "production");
  assert.equal(await currentGameMode(f.env), "production");
  assert.equal((await catalog(f.env))[0].demo, 0);
});
test("owner can activate production and return to demo with audit; stale POST rejected", async () => {
  const f = fixture(2, 3);
  const a = await gameCatalogModeAdmin(change("production", 0), f.env);
  assert.equal(a.status, 200);
  assert.equal((await a.json() as {mode: string}).mode, "production");
  assert.equal(f.audit.length, 1);
  await assert.rejects(() => gameCatalogModeAdmin(change("demo", 0), f.env), (e: unknown) =>
    e instanceof HttpError && e.status === 409);
  const b = await gameCatalogModeAdmin(change("demo", 1), f.env);
  assert.equal((await b.json() as {mode: string}).mode, "demo");
  assert.equal(f.audit.length, 2);
});
test("cannot activate production without both published origins or storage", async () => {
  for (const f of [fixture(0, 1),fixture(1, 0),fixture(1, 1, "demo", false)]) {
    await assert.rejects(() => gameCatalogModeAdmin(change("production", 0), f.env),
      (e: unknown) => e instanceof HttpError && e.status === 409);
    assert.equal(f.control.mode, "demo");
    assert.equal(f.audit.length, 0);
  }
});
test("invalid body and double confirmation are rejected", async () => {
  const f = fixture(1, 1);
  for (const body of [{ mode:"production",revision:0 },{mode:"production",revision:0,confirm:false}]) {
    const request = new Request("https://test/api/admin/game-catalog-mode", {
      method:"POST",body:JSON.stringify(body),
    });
    await assert.rejects(() => gameCatalogModeAdmin(request,f.env),
      (e: unknown) => e instanceof HttpError && e.status === 400);
  }
});
test("owner endpoint remains inaccessible without auth; public health reports persisted mode", async () => {
  const f = fixture(2, 2, "production");
  const denied = await worker.fetch(new Request("https://test/api/admin/game-catalog-mode"), f.env);
  assert.equal(denied.status, 401);
  const health = await worker.fetch(new Request("https://test/api/health"), f.env);
  assert.deepEqual((await health.json() as {demo: boolean}).demo, false);
});
test("a previously assigned demo image still renders SVG when mode has changed", async () => {
  const f = fixture(2, 2, "production");
  const response = await media(f.env, {
    id:"legacy-demo", type:"REAL", title:"", description:"", author:"",
    explanation:"", r2_key:"demo-legacy", demo:1,
  });
  assert.match(response.headers.get("content-type") || "", /svg/);
  assert.match(await response.text(), /<svg/);
});
