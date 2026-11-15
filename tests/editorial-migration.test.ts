/** Upgrade real legacy data without paid backfill, losing settings/calls or touching assigned round bytes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

test("editorial migration preserves legacy data and withdraws only non-4:5 published copies", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("migrations").filter(f => f >= "0033" && f < "0050").sort()) db.exec(readFileSync("migrations/" + file, "utf8"));
    const insert = db.prepare(`INSERT INTO images(id,origin,status,title,description,original_key,original_sha256,original_mime,
      width,height,copy_key,copy_sha256,copy_crop,created_at,updated_at,published_at) VALUES(?,'REAL',?,'Legacy','Commons text',?,?,'image/png',100,100,?,?,?,'before','before','before')`);
    for (const [i, crop, status] of [[1, '{"format":"3:2"}', "published"], [2, null, "published"], [3, '{"format":"4:5"}', "published"], [4, '{"format":"3:2"}', "approved"]] as const)
      insert.run("old-" + i, status, "original-" + i, String(i).padStart(64, "0"), "copy-" + i, String(i).padStart(64, "0"), crop);
    db.exec(`INSERT INTO slop_batches(id,theme,slots,origin,auto_status,created_at,updated_at) VALUES('paused','[]','[]','auto','running','before','before');
      INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at) VALUES('paid','analysis','chosen-model','uncertain','before','before');
      INSERT INTO app_settings(key,value,updated_at) VALUES('image_quality','medium','before');`);
    db.exec(readFileSync("migrations/0050_editorial_loop.sql", "utf8"));
    assert.deepEqual(db.prepare("SELECT status FROM images ORDER BY id").all().map(r => r.status), ["approved", "approved", "published", "approved"]);
    assert.deepEqual(db.prepare("SELECT copy_key FROM retired_copies ORDER BY copy_key").all().map(r => r.copy_key), ["copy-1", "copy-2"]);
    assert.equal(db.prepare("SELECT count(*) AS n FROM images WHERE real_description IS NULL AND description='Commons text'").get()?.n, 4);
    const legacy = db.prepare("SELECT * FROM slop_batches WHERE id='paused'").get()!;
    assert.equal(legacy.pipeline_version, 1); assert.equal(legacy.auto_status, "running"); assert.equal(legacy.loop_settings, null);
    assert.equal(db.prepare("SELECT status FROM paid_calls WHERE id='paid'").get()?.status, "uncertain");
    assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='image_quality'").get()?.value, "medium");
    assert.equal(db.prepare("SELECT count(*) AS n FROM slop_processes").get()?.n, 0);
  } finally { db.close(); }
});
