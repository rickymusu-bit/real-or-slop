/** Historical recovery is conservative, anonymous and independent of publication or surviving jobs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("recover verified old jobs once, collapse edits, and preserve new counts and all photos", () => {
  const db = new DatabaseSync(":memory:"), migration = "0079_recover_verified_generation_counts.sql";
  try {
    db.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT)");
    for (const file of readdirSync("migrations").sort().filter(file => file < migration)) db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec(`INSERT INTO d1_migrations(name,applied_at) VALUES('0078_observed_slop_and_usage.sql','2026-11-27 04:16:38');
      INSERT INTO galleries(id,title) VALUES('g','Test');`);
    const sources = Array.from({ length: 4 }, () => randomUUID());
    for (const [i, id] of sources.entries()) db.prepare(`INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at,slop_generated_count)
      VALUES(?,'g',?,'new',?,?,?,'image/png',40,50,'now','now',5)`).run(id, i === 3 ? "SLOP" : "REAL", i === 3 ? null : "Real", id, String(i).repeat(64));
    const before = db.prepare("SELECT id,status,revision,original_key,updated_at FROM images ORDER BY id").all();
    const old = "2026-11-26T22:12:00.000Z", later = "2026-11-26T22:17:00.000Z", fresh = "2026-11-27T04:16:38.100Z";
    const call = (job: string, kind: string, at = old, status = "completed", suffix = randomUUID() as string, updated = at) =>
      db.prepare("INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at) VALUES(?,?,'fake',?,?,?)")
        .run(`pipeline-${job}-${suffix}`, kind, status, at, updated);
    const job = (source: string) => `${randomUUID()}-${source}`;
    for (const source of sources.slice(0, 3)) {
      const id = job(source);
      call(id, "images"); call(id, "evaluation", later);
      call(id, "images", later); call(id, "evaluation", later); // Edits and repeated reviews do not add uses.
    }
    const extra = job(sources[0]); call(extra, "images"); call(extra, "evaluation", later); // Another initial generation counts.
    call(job(sources[0]), "images"); // A completed API response alone does not prove a saved candidate.
    const failed = job(sources[0]); call(failed, "images", old, "uncertain"); call(failed, "evaluation", later);
    const pending = job(sources[0]); call(pending, "images"); call(pending, "evaluation", later, "pending");
    const newJob = job(sources[0]); call(newJob, "images", fresh); call(newJob, "evaluation", fresh);
    const straddling = job(sources[0]); call(straddling, "images"); call(straddling, "evaluation", later, "completed", randomUUID(), fresh);
    const backwards = job(sources[0]); call(backwards, "images", later); call(backwards, "evaluation", old);
    const invalid = `malformed-job-key-with-36-characters!!-${sources[0]}`; call(invalid, "images"); call(invalid, "evaluation", later);
    const invalidRequest = job(sources[0]); call(invalidRequest, "images", old, "completed", "x".repeat(36)); call(invalidRequest, "evaluation", later);
    const slop = job(sources[3]); call(slop, "images"); call(slop, "evaluation", later);
    const deleted = job(randomUUID()); call(deleted, "images"); call(deleted, "evaluation", later);
    const ledger = db.prepare("SELECT * FROM paid_calls ORDER BY id").all();
    const sql = readFileSync("migrations/" + migration, "utf8");
    db.exec(sql);
    assert.deepEqual(sources.map(id => ({ ...db.prepare("SELECT slop_generated_count,slop_legacy_generated_count FROM images WHERE id=?").get(id) })), [
      { slop_generated_count: 7, slop_legacy_generated_count: 2 }, { slop_generated_count: 6, slop_legacy_generated_count: 1 },
      { slop_generated_count: 6, slop_legacy_generated_count: 1 }, { slop_generated_count: 5, slop_legacy_generated_count: 0 },
    ]);
    // Reapplying the recovery statement does not add the same baseline again, even after a new live generation.
    db.prepare("UPDATE images SET slop_generated_count=slop_generated_count+1 WHERE id=?").run(sources[0]);
    db.exec(sql.slice(sql.indexOf("WITH cutoff")));
    assert.equal(db.prepare("SELECT slop_generated_count AS n FROM images WHERE id=?").get(sources[0])?.n, 8);
    assert.deepEqual(db.prepare("SELECT id,status,revision,original_key,updated_at FROM images ORDER BY id").all(), before);
    assert.deepEqual(db.prepare("SELECT * FROM paid_calls ORDER BY id").all(), ledger);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
