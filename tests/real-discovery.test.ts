import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index";
import { realDiscovery } from "../worker/real-discovery";
import type { Env } from "../worker/core";

test("REAL discovery reservation is authenticated and disabled before accessing D1", async () => {
  const path = "https://test/api/admin/editorial/real-discovery/reserve";
  const env = { ADMIN_TOKEN: "x".repeat(40) } as Env;
  assert.equal((await worker.fetch(new Request(path, { method: "POST" }), env)).status, 401);
  const response = await worker.fetch(new Request(path, { method: "POST", headers: { Authorization: "Bearer " + env.ADMIN_TOKEN }, body: "{}" }), env);
  assert.equal(response.status, 503);
  assert.match((await response.json() as { error: string }).error, /non abilitata/);
});
test("REAL discovery refuses invalid reservation parameters before any database access", async () => {
  const env = { ENABLE_REAL_DISCOVERY_PAID: "true", REAL_DISCOVERY_MODEL: "gpt-6.1-terra" } as Env;
  const value = { run_id: "test", stage: "strategies", model: "gpt-6.1-terra", fingerprint: "a".repeat(64) };
  for (const change of [{ model: "other" }, { run_id: "../invalid" }, { stage: "generation" }, { fingerprint: "a" }, { cost: .001 }]) {
    await assert.rejects(realDiscovery(new Request("https://test", { method: "POST", body: JSON.stringify({ ...value, ...change }) }), env), /non valida/);
  }
  await assert.rejects(realDiscovery(new Request("https://test", { method: "POST", body: JSON.stringify(value) }), env), /Configurare/);
});
