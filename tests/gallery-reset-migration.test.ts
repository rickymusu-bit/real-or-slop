import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("the gallery release resets application data and requires gallery membership", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("migrations").sort().filter(file => file < "0061"))
      db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec(`
      CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO d1_migrations VALUES(1,'0060_editorial_galleries.sql');
      INSERT INTO galleries(id,title,slop_instructions) VALUES('old-gallery','Old gallery','A previous instruction');
      INSERT INTO images(id,origin,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
        VALUES('real','REAL','Old photograph','real',lower(hex(randomblob(32))),'image/png',40,50,'now','now'),
              ('slop','SLOP',NULL,'slop',lower(hex(randomblob(32))),'image/png',40,50,'now','now');
      INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('old','[]','[]','now','now');
      INSERT INTO slop_processes(id,batch_id,slot,snapshot,created_at,updated_at)
        VALUES('process','old',0,'{}','now','now');
      INSERT INTO slop_reference_uses(source_id,process_id,image_id,created_at) VALUES('real','process','slop','now');
      INSERT INTO slop_gallery_sources(process_id,source_id,revision) VALUES('process','real',0);
      INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,process_id)
        VALUES('paid','prompts','fake','completed','now','now','process');
      INSERT INTO game_sessions(id,mode,level,created_at,owner_hash) VALUES('game','levels','facile',0,'owner');
      INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) VALUES('round','game','real',0,'old-copy');
      INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) VALUES('round','REAL',1,1,1);
      INSERT INTO tags(id,label,created_at) VALUES('tag','street','now');
      INSERT INTO image_tags VALUES('real','tag');
      INSERT INTO settings(key,value,updated_at) VALUES('text_model','gpt-5','now');
      INSERT INTO app_settings(key,value,updated_at) VALUES('editorial_tolerance','2','now');
      INSERT INTO model_contexts(id,part,body,created_at) VALUES('context','slop_prompt','Old context','now');
    `);
    db.exec(readFileSync("migrations/0061_reset_for_galleries.sql", "utf8"));
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='d1_migrations'").all();
    for (const {name} of tables) {
      assert.equal(db.prepare(`SELECT count(*) AS total FROM "${name}"`).get()?.total, 0, String(name));
    }
    assert.equal(db.prepare("SELECT count(*) AS total FROM d1_migrations").get()?.total, 1);
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name IN ('slop_reference_uses','slop_source_states')").get(), undefined);

    db.exec("INSERT INTO galleries(id,title) VALUES('new-gallery','New gallery')");
    const image = db.prepare(`INSERT INTO images(id,gallery_id,origin,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
      VALUES('image',?,'REAL','New photograph','image',lower(hex(randomblob(32))),'image/png',40,50,'now','now')`);
    const batch = db.prepare(`INSERT INTO slop_batches(id,gallery_id,theme,slots,created_at,updated_at)
      VALUES('batch',?,'[]','[]','now','now')`);
    for (const insert of [image, batch]) {
      assert.throws(() => insert.run(null), /gallery required/);
      assert.throws(() => insert.run("missing-gallery"), /FOREIGN KEY/);
      insert.run("new-gallery");
    }
    for (const table of ["images", "slop_batches"])
      assert.throws(() => db.exec(`UPDATE ${table} SET gallery_id=NULL`), /gallery required/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
