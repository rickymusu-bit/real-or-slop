/** Removing description search storage preserves the photos, axes, profiles, jobs and paid-call history. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("retire REAL search indexes without losing descriptions or pipeline state", () => {
  const db = new DatabaseSync(":memory:");
  const migration = "0076_remove_real_description_indexes.sql";
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("migrations").sort().filter(file => file < migration))
      db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec(`INSERT INTO galleries(id,title) VALUES('g','Consoles');
      INSERT INTO images(id,gallery_id,origin,status,title,description,source_url,author,license_name,license_url,prompt,model,
        original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,created_at,updated_at)
      VALUES('real','g','REAL','published','Game Boy','Commons text','https://example.org','Author','CC BY','https://example.org',
        '','','real','${"a".repeat(64)}','image/png',40,50,'copy','${"b".repeat(64)}','now','now'),
        ('other','g','REAL','new','Other','Other source','','','','','','','other','${"c".repeat(64)}','image/png',40,50,NULL,NULL,'now','now');
      UPDATE images SET visual_description='{"sections":{"subject_type":"Nintendo Game Boy DMG-01.","environment":"A desk."},"indications":{},"subject":{"brand":"Nintendo","keys":{"brand":"nintendo"}},"model":"m"}',
        pipeline_profile='{"genre":"amateur","parameters":{},"peculiarities":[]}',
        visual_description_request='real-index-claim',visual_description_claimed_at='now' WHERE id='real';
      UPDATE images SET visual_description_request='describe-claim',visual_description_claimed_at='now' WHERE id='other';
      INSERT INTO real_environment_vectors(image_id,model,embedding) VALUES('real','text-embedding-3-small','[1,0]');
      INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,image_id) VALUES
        ('real-index-claim-environment','analysis','text-embedding-3-small','pending','now','now','real'),
        ('completed','analysis','m','completed','now','now','real');
      INSERT INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at)
        VALUES('job','g','other','queued','{"operation":"profile"}','req','now','now');
      INSERT INTO game_sessions(id,mode,level,created_at,owner_hash) VALUES('game','levels','facile',0,'owner');
      INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) VALUES('round','game','real',0,'copy');`);
    const before = db.prepare("SELECT * FROM images WHERE id='real'").get()!;
    const other = db.prepare("SELECT * FROM images WHERE id='other'").get();
    const jobs = db.prepare("SELECT * FROM pipeline_jobs").all();
    const apply = () => db.exec(readFileSync("migrations/" + migration, "utf8"));
    apply();
    const description = JSON.parse(String(before.visual_description));
    delete description.subject;
    assert.deepEqual({ ...db.prepare("SELECT * FROM images WHERE id='real'").get() }, {
      ...before, visual_description: JSON.stringify(description), visual_description_request: null, visual_description_claimed_at: null,
    });
    assert.deepEqual(db.prepare("SELECT * FROM images WHERE id='other'").get(), other);
    assert.deepEqual(db.prepare("SELECT * FROM pipeline_jobs").all(), jobs);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'images_real_subject_%' OR name IN ('real_environment_vectors','real_environment_invalidate')").all(), []);
    assert.equal(db.prepare("SELECT count(*) AS n FROM paid_calls").get()?.n, 2);
    assert.equal(db.prepare("SELECT status FROM paid_calls WHERE id='completed'").get()?.status, "completed");
    assert.equal(db.prepare("SELECT status FROM paid_calls WHERE id='real-index-claim-environment'").get()?.status, "uncertain");
    assert.equal(db.prepare("SELECT count(*) AS n FROM game_rounds").get()?.n, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    apply(); // The cleanup is safe when there are no search records left.
  } finally { db.close(); }
});
