import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("preview gate rejects missing, shared or unverified resources", () => {
  const folder = mkdtempSync(join(tmpdir(), "ros-preview-"));
  try {
    const file = join(folder, "wrangler.jsonc");
    const run = (config: unknown) => {
      writeFileSync(file, JSON.stringify(config));
      return spawnSync("node", ["scripts/check-preview.mjs", file], {
        encoding: "utf8",
      });
    };
    assert.match(run({ previews: {} }).stderr, /mancanti/);
    const preview = {
      d1_databases: [{ binding: "DB", database_id: "fixture-test-id" }],
      r2_buckets: [
        { binding: "IMAGES", bucket_name: "fixture-test-images" },
        { binding: "QUARANTINE", bucket_name: "fixture-test-private" },
      ],
    };
    assert.equal(run({ previews: preview }).status, 0);
    assert.match(
      run({ previews: preview, d1_databases: preview.d1_databases }).stderr,
      /produzione/,
    );
    assert.match(
      run({
        previews: {
          ...preview,
          d1_databases: [{ binding: "DB", database_id: "REPLACE_ME" }],
        },
      }).stderr,
      /non verificata/,
    );
  } finally {
    rmSync(folder, { recursive: true });
  }
});
