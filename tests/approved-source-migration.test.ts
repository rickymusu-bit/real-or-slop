/** Counts need exact private attribution; unknown historic links must never be invented. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
test("source migration preserves photos, recovers only exact retained links, and deleting a REAL keeps its SLOP", () => {
  const db = new DatabaseSync(":memory:"), migration = "0081_approved_slop_sources.sql";
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT)");
    for (const file of readdirSync("migrations").sort().filter(file => file < migration)) db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec(`INSERT INTO galleries(id,title,pipeline_settings) VALUES('g','Test','{"environment":"keep","rules":"custom"}');
      INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
      VALUES('r','g','REAL','new','Real','r','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','image/png',40,50,'now','now'),('s','g','SLOP','new',NULL,'s','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','image/png',40,50,'now','now'),('old','g','SLOP','new',NULL,'old','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','image/png',40,50,'now','now');
      UPDATE images SET status=CASE id WHEN 's' THEN 'approved' ELSE 'published' END,copy_key=id||'-copy',copy_sha256=original_sha256,copy_width=40,copy_height=50,copy_bytes=100,copy_crop='{"x":0,"y":0,"width":40,"height":50,"format":"4:5"}' WHERE origin='SLOP';
      INSERT INTO pipeline_jobs(id,gallery_id,source_id,image_id,state,snapshot,created_at,updated_at) VALUES('j','g','r','s','attention','{}','now','now');`);
    const before = db.prepare("SELECT * FROM images ORDER BY id").all().map(row => ({...row}));
    db.exec(readFileSync("migrations/" + migration, "utf8"));
    const after = db.prepare("SELECT * FROM images ORDER BY id").all().map(row => { const copy = {...row}; delete copy.slop_source_id; return copy; });
    assert.deepEqual(after, before);
    assert.equal(db.prepare("SELECT slop_source_id AS source FROM images WHERE id='s'").get()?.source, "r");
    assert.equal(db.prepare("SELECT slop_source_id AS source FROM images WHERE id='old'").get()?.source, null);
    assert.deepEqual(JSON.parse(String(db.prepare("SELECT pipeline_settings AS settings FROM galleries").get()?.settings)), {environment:"auto",rules:"custom"});
    db.exec("DELETE FROM images WHERE id='r'");
    assert.equal(db.prepare("SELECT slop_source_id AS source FROM images WHERE id='s'").get()?.source, null);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM images").get()?.n, 2);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
