/** Retiring scoring removes only its settings; paid observations and photographic treatment remain intact. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("retire crowding/detail without changing images, technical metrics, profiles, jobs or paid history", () => {
  const db = new DatabaseSync(":memory:");
  const migration = "0077_retire_crowding_detail.sql";
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("migrations").sort().filter(file => file < migration))
      db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec(`INSERT INTO galleries(id,title,max_crowdedness,max_detail) VALUES('g','Console',30,40);
      INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at,
        visual_description,pipeline_profile,copy_metrics,copy_treatment)
      VALUES('real','g','REAL','new','Game Boy','original','${"a".repeat(64)}','image/png',40,50,'now','now',
        '{"sections":{"subject_type":"Game Boy"}}','{"genre":"amateur"}','{"noise":0.1}','{"off":true}');
      INSERT INTO real_measures(id,image_id,model,base_context,measure_context,observation,crowdedness,detail,created_at,formula)
        VALUES('measure','real','m','base','context','{"subject":{},"others":[]}',29,38,'now',2);
      INSERT INTO paid_calls(id,kind,model,status,image_id,created_at,updated_at)
        VALUES('measure-call','analysis','m','completed','real','now','now');
      INSERT INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at)
        VALUES('job','g','real','queued','{"operation":"profile"}','req','now','now');
      INSERT INTO app_settings(key,value,updated_at) VALUES
        ('crowdedness_threshold','60','now'),('detail_threshold','80','now'),('commons_checks_per_night','75','now');`);
    const snapshot = () => ["images", "real_measures", "paid_calls", "pipeline_jobs", "model_contexts"]
      .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    const gallery = { ...db.prepare("SELECT * FROM galleries").get() };
    delete gallery.max_crowdedness;
    delete gallery.max_detail;
    db.exec(readFileSync("migrations/" + migration, "utf8"));
    assert.deepEqual(snapshot(), before);
    assert.deepEqual({ ...db.prepare("SELECT * FROM galleries").get() }, gallery);
    assert.deepEqual(db.prepare("SELECT key FROM app_settings WHERE key IN ('crowdedness_threshold','detail_threshold')").all(), []);
    assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='commons_checks_per_night'").get()?.value, "75");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.exec("DELETE FROM galleries WHERE id='g'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM real_measures").get()?.n, 0); // Historical observations still follow the photo lifecycle.
  } finally { db.close(); }
});
