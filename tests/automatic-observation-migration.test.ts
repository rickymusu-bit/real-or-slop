/** Existing paid attempts must remain claimed when approval becomes automatic. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("automatic observation migration preserves cached observations and uncertain claims after job deletion", () => {
  const db = new DatabaseSync(":memory:"), migration = "0080_automatic_slop_observation.sql";
  try {
    db.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT)");
    for (const file of readdirSync("migrations").sort().filter(file => file < migration)) db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec("INSERT INTO galleries(id,title) VALUES('g','Test')");
    const photos = Array.from({ length: 4 }, () => randomUUID()), requests = photos.map(() => randomUUID());
    for (const [i, id] of photos.entries()) db.prepare(`INSERT INTO images(id,gallery_id,origin,status,original_key,original_sha256,original_mime,width,height,created_at,updated_at,pipeline_slop_observation)
      VALUES(?,'g','SLOP','new',?,?,'image/png',40,50,'now','now',?)`).run(id, id, String(i).repeat(64), i === 0 ? '{"saved":"observation"}' : null);
    for (const [i, status] of ["completed", "uncertain"].entries()) db.prepare("INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at) VALUES(?,'analysis','fake',?,'now','now')")
      .run(`pipeline-${requests[i]}-${photos[i]}-${requests[i]}`, status);
    db.prepare(`INSERT INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at) VALUES(?,'g',?,'queued','{"operation":"observe"}',?,'now','now')`)
      .run(`${requests[2]}-${photos[2]}`, photos[2], requests[2]);
    const before = db.prepare("SELECT * FROM images ORDER BY id").all().map(row => ({ ...row }));
    db.exec(readFileSync("migrations/" + migration, "utf8"));
    for (const [i, id] of photos.entries()) assert.equal(db.prepare("SELECT slop_observation_request AS claim FROM images WHERE id=?").get(id)?.claim, i < 3 ? requests[i] : null);
    const after = db.prepare("SELECT * FROM images ORDER BY id").all().map(row => { const copy = { ...row }; delete copy.slop_observation_request; return copy; });
    assert.deepEqual(after, before);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
