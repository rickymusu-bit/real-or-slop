import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
import { parseAppliedMigrations, pendingDemoMigrations, releaseDemo, validateDemoConfig } from "../scripts/deployment-config.mjs";

const migrationFiles = ["0001_initial.sql", "0002_unique_image_hash.sql"];
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

test("current D1 schema deploys without a migration approval and without DB writes", () => {
  for (const approved of [false, true]) {
    const commands: string[][] = [];
    let reads = 0;
    const result = releaseDemo({
      files: migrationFiles, approved,
      readApplied: () => { reads++; return [...migrationFiles]; },
      run: (args: string[]) => commands.push(args),
    });
    assert.equal(reads, 1);
    assert.deepEqual(result.migrationsApplied, []);
    assert.deepEqual(commands, [["deploy", "--no-experimental-provision", "--keep-vars"]]);
  }
});

test("pending schema changes stop the automatic release before any mutation", () => {
  const commands: string[][] = [];
  assert.throws(() => releaseDemo({
    files: migrationFiles, approved: false,
    readApplied: () => migrationFiles.slice(0, 1),
    run: (args: string[]) => commands.push(args),
  }), /EDITORIAL_SCHEMA_RELEASE_APPROVED/);
  assert.deepEqual(commands, []);
});

test("approved pending migrations must be verified complete before seed and deployment", () => {
  const commands: string[][] = [];
  let reads = 0;
  releaseDemo({
    files: migrationFiles, approved: true,
    readApplied: () => ++reads === 1 ? migrationFiles.slice(0, 1) : [...migrationFiles],
    run: (args: string[]) => commands.push(args),
  });
  assert.equal(reads, 2);
  assert.deepEqual(commands, [
    ["d1", "migrations", "apply", "DB", "--remote"],
    ["d1", "execute", "DB", "--remote", "--file", "scripts/seed.sql"],
    ["deploy", "--no-experimental-provision", "--keep-vars"],
  ]);
});

test("failed or incomplete migrations cannot fall through to publication", () => {
  for (const failed of [false, true]) {
    const commands: string[][] = [];
    assert.throws(() => releaseDemo({
      files: migrationFiles, approved: true,
      readApplied: () => migrationFiles.slice(0, 1),
      run: (args: string[]) => { commands.push(args); if (failed) throw Error("D1 failed"); },
    }), failed ? /D1 failed/ : /non completate/);
    assert.deepEqual(commands, [["d1", "migrations", "apply", "DB", "--remote"]]);
  }
});

test("unavailable or incompatible migration history prevents even an approved release", () => {
  for (const applied of [[migrationFiles[1]], [...migrationFiles, "0003_future.sql"], [migrationFiles[0], migrationFiles[0]]]) {
    assert.throws(() => pendingDemoMigrations(migrationFiles, applied), /non compatibile/);
  }
  const commands: string[][] = [];
  assert.throws(() => releaseDemo({
    files: migrationFiles, approved: true,
    readApplied: () => { throw Error("D1 unavailable"); },
    run: (args: string[]) => commands.push(args),
  }), /unavailable/);
  assert.deepEqual(commands, []);
});

test("migration discovery accepts only successful structured Wrangler responses", () => {
  assert.deepEqual(parseAppliedMigrations(JSON.stringify([{ success: true, results: [{ name: migrationFiles[0] }] }])), [migrationFiles[0]]);
  for (const response of ["not JSON", "[]", "null", '[{"success":false,"results":[]}]', '[{"success":true,"results":[{}]}]']) {
    assert.throws(() => parseAppliedMigrations(response), /nessuna pubblicazione/);
  }
});
