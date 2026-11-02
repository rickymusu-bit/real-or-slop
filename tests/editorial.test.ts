import { test } from "node:test";
import assert from "node:assert/strict";
import { editorial } from "../worker/editorial.ts";
import type { Env } from "../worker/core.ts";

test("paid reservation is disabled without explicit server enablement and positive prices", async () => {
  const request = () => new Request("https://test/api/admin/editorial/budget", { method: "POST", body: JSON.stringify({ id: "call", run_id: "run", kind: "evaluation" }) });
  await assert.rejects(editorial(request(), {} as Env, "/api/admin/editorial/budget"), /non abilitate/);
  await assert.rejects(editorial(request(), { ENABLE_EDITORIAL_PAID: "true" } as Env, "/api/admin/editorial/budget"), /Budget server/);
});
