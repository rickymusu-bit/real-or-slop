/** Production and previews never share a database or a bucket (owner request of 2026-11-12).
 * The deploy of main uses the top-level bindings; previews of pull requests use the «previews» block; the «preview» environment
 * only serves to apply the migrations to the preview database. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";

interface D1 { binding: string; database_name: string; database_id?: string }
interface R2 { binding: string; bucket_name: string }
interface Block { d1_databases: D1[]; r2_buckets: R2[] }
const config = parse(readFileSync("wrangler.jsonc", "utf8"), [], { allowTrailingComma: true }) as Block & { previews: Block; env: Record<string, Block> };
const PRODUCTION = { db: "98a3e712-d9f9-4510-91ab-2b80329be753", buckets: ["real-or-slop-approved", "real-or-slop-quarantine"] };
const ids = (b: Block) => b.d1_databases.map(d => d.database_id);
const buckets = (b: Block) => b.r2_buckets.map(r => r.bucket_name).sort();

test("main deploys to the production database and buckets", () => {
  assert.deepEqual(ids(config), [PRODUCTION.db]);
  assert.deepEqual(buckets(config), PRODUCTION.buckets);
});

test("previews and the «preview» environment use their own resources, the same in both, never the production ones", () => {
  for (const block of [config.previews, config.env.preview]) {
    assert.ok(!ids(block).includes(PRODUCTION.db));
    assert.ok(buckets(block).every(name => !PRODUCTION.buckets.includes(name) && name.startsWith("real-or-slop-preview-")));
    assert.deepEqual(block.d1_databases.map(d => d.binding), ["DB"]);
    assert.deepEqual(block.r2_buckets.map(r => r.binding).sort(), ["IMAGES", "QUARANTINE"]);
  }
  assert.deepEqual(config.previews.d1_databases, config.env.preview.d1_databases);
  assert.deepEqual(config.previews.r2_buckets, config.env.preview.r2_buckets);
});
