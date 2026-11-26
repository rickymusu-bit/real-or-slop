/** Observation/usage migration preserves the existing photos and active jobs. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("observations start empty, usage starts at zero, and existing pipeline state is preserved", () => {
  const db = new DatabaseSync(":memory:"), migration = "0078_observed_slop_and_usage.sql";
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("migrations").sort().filter(file => file < migration)) db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec(`INSERT INTO galleries(id,title) VALUES('g','Test');
      INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at,pipeline_profile)
      VALUES('r','g','REAL','new','Real','r','${"a".repeat(64)}','image/png',40,50,'now','now','{"genre":"snapshot"}');
      INSERT INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at)
      VALUES('j','g','r','working','{"operation":"generate"}','request','now','now');`);
    const photo = db.prepare("SELECT * FROM images").get(), job = db.prepare("SELECT * FROM pipeline_jobs").get();
    db.exec(readFileSync("migrations/" + migration, "utf8"));
    assert.deepEqual({ ...db.prepare("SELECT * FROM images").get() }, { ...photo, pipeline_observed: null, slop_generated_count: 0 });
    assert.deepEqual({ ...db.prepare("SELECT * FROM pipeline_jobs").get() }, { ...job, generation_counted: 0 });
    assert.throws(() => db.exec("UPDATE images SET slop_generated_count=-1"), /CHECK/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
