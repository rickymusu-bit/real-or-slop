import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
import { validateDemoConfig } from "../scripts/deployment-config.mjs";

const config = parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
test("release keeps the existing Worker/D1 and exactly the owner-confirmed R2 bindings", () => {
  assert.deepEqual(validateDemoConfig(config).buckets, {
    QUARANTINE: "real-or-slop-quarantine", IMAGES: "real-or-slop-approved",
  });
  assert.equal(validateDemoConfig(config).db.database_id, "98a3e712-d9f9-4510-91ab-2b80329be753");
  assert.equal(config.vars.DATA_MODE, "demo");
});

test("release refuses changed accounts, databases, data mode or unexpected R2 resources", () => {
  assert.throws(() => validateDemoConfig(config, "different-account"), /Account/);
  assert.throws(() => validateDemoConfig({ ...config, account_id: "different-account" }), /riservato/);
  assert.throws(() => validateDemoConfig({ ...config, name: "new-worker" }), /riservato/);
  assert.throws(() => validateDemoConfig({ ...config, vars: { DATA_MODE: "production" } }), /riservato/);
  assert.throws(() => validateDemoConfig({ ...config, d1_databases: [] }), /Database/);
  assert.throws(() => validateDemoConfig({ ...config, d1_databases: [{ ...config.d1_databases[0], database_id: "different-db" }] }), /Database/);
  for (const buckets of [
    [], [config.r2_buckets[0]],
    [...config.r2_buckets, { binding: "EXTRA", bucket_name: "new-bucket" }],
    [{ ...config.r2_buckets[0], bucket_name: "real-or-slop-quarantine-local" }, config.r2_buckets[1]],
    [config.r2_buckets[0], { ...config.r2_buckets[1], bucket_name: config.r2_buckets[0].bucket_name }],
    [config.r2_buckets[0], config.r2_buckets[0]],
  ]) assert.throws(() => validateDemoConfig({ ...config, r2_buckets: buckets }), /R2/);
});
