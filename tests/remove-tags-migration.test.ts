/** Migration 0063 retires tags (owner decision of 2026-11-20): every other row and column stays as it was. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("removing tags drops their tables and fields and keeps photos, descriptions, processes, calls and games", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("migrations").sort().filter(file => file < "0063")) db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec(`
      INSERT INTO galleries(id,title,slop_instructions) VALUES('gallery','Strade','Un falso plausibile');
      INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,
          copy_crop,copy_metrics,real_description,analysis_status,generated_tags,categories_completed_at,created_at,updated_at)
        VALUES('real','gallery','REAL','published','Via del Corso','real',lower(hex(randomblob(32))),'image/png',40,50,'real-copy',lower(hex(randomblob(32))),
          '{"x":0,"y":0,"width":40,"height":50,"format":"4:5"}','{"long":50,"noise":2,"sharpness":5,"contrast":180,"saturation":0,"cast":[0,0,0]}',
          '{"visible":"Una strada","documented_context":"Roma","uncertainties":""}','done','["street","1960s"]','now','now','now'),
        ('slop','gallery','SLOP','new',NULL,'slop',lower(hex(randomblob(32))),'image/png',40,50,NULL,NULL,NULL,NULL,NULL,'done','["street"]',NULL,'now','now');
      INSERT INTO tags(id,label,category,created_at) VALUES('street','street','setting','now'),('decade','1960s','time','now');
      INSERT INTO tag_aliases(alias,tag_id,created_at) VALUES('road','street','now');
      INSERT INTO image_tags(image_id,tag_id) VALUES('real','street'),('real','decade'),('slop','street');
      INSERT INTO slop_batches(id,theme,slots,created_at,updated_at,gallery_id) VALUES('batch','[]','[{"title":"SLOP manuale","tags":[]}]','now','now','gallery');
      INSERT INTO slop_processes(id,batch_id,slot,image_id,state,snapshot,created_at,updated_at)
        VALUES('process','batch',0,'slop','accepted','{"source_tags":{"color":["black-and-white"]}}','now','now');
      INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,image_id) VALUES('call','analysis','fake','completed','now','now','real');
      INSERT INTO game_sessions(id,mode,level,created_at,owner_hash) VALUES('game','levels','facile',0,'owner');
      INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) VALUES('round','game','real',0,'real-copy');
      INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) VALUES('round','REAL',1,1,1);
    `);
    const retired = ["generated_tags", "categories_completed_at"];
    const tables = ["images", "galleries", "slop_batches", "slop_processes", "paid_calls", "game_sessions", "game_rounds", "answers"];
    const columns = new Map(tables.map(t => [t, db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name as string)
      .filter(c => t !== "images" || !retired.includes(c))]));
    const rows = (t: string) => db.prepare(`SELECT ${columns.get(t)!.join(",")} FROM ${t} ORDER BY rowid`).all();
    const before = tables.map(rows);
    db.exec(readFileSync("migrations/0063_remove_tags.sql", "utf8"));
    tables.forEach((t, i) => {
      assert.deepEqual(rows(t), before[i], t);
      assert.deepEqual(db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name), columns.get(t), t);
    });
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE '%tag%'").all(), []);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    // Deleting a photo still works without the cascade to its tags.
    db.exec("DELETE FROM images WHERE id='slop'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM images").get()?.n, 1);
  } finally { db.close(); }
});
