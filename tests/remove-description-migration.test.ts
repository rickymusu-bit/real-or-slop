/** Migration 0066 retires the editorial description of the REAL, its analysis and the description of the SLOP (owner decisions of
 * 2026-11-20), and saves the proposed «Base comune» and «Premessa e prompt di galleria» as current versions, once. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
const DEFAULTS: Record<string, string> = JSON.parse(readFileSync("tests/fixtures/legacy-model-contexts.json", "utf8"));

const MIGRATION = "migrations/0066_remove_editorial_description.sql";
const RETIRED = ["real_description", "real_description_provenance", "commons_description", "analysis_status", "analysis_error",
  "analyzed_at", "analysis_base_context", "analysis_task_context"];
const before = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("migrations").sort().filter(file => file < "0066")) db.exec(readFileSync("migrations/" + file, "utf8"));
  return db;
};
const current = (db: DatabaseSync, part: string) =>
  db.prepare("SELECT body FROM model_contexts WHERE part=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(part)?.body;

test("the description fields go; photos, the REAL source description, calls and games stay", () => {
  const db = before();
  try {
    db.exec(`INSERT INTO galleries(id,title,slop_instructions) VALUES('g','Strade','');
      INSERT INTO images(id,gallery_id,origin,status,title,description,source_url,author,license_name,license_url,prompt,model,
          original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,created_at,updated_at,
          real_description,real_description_provenance,commons_description,analysis_status,analyzed_at)
        VALUES('real','g','REAL','published','Via del Corso','Una strada di Roma','https://commons.wikimedia.org/wiki/File:A.jpg','Autrice',
          'CC BY 4.0','https://creativecommons.org/licenses/by/4.0/','','','a','${"a".repeat(64)}','image/png',40,50,'a-copy','${"b".repeat(64)}',
          'now','now','{"visible":"Una strada","documented_context":"Roma"}','{"model":"m"}','Testo Commons','done','now'),
        ('slop','g','SLOP','new',NULL,'Nota libera','','','','','A street','gpt-image-2','s','${"c".repeat(64)}','image/png',40,50,NULL,NULL,
          'now','now',NULL,NULL,NULL,'none',NULL);
      INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,image_id) VALUES('call','analysis','m','completed','now','now','real');
      INSERT INTO game_sessions(id,mode,level,created_at,owner_hash) VALUES('game','levels','facile',0,'owner');
      INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) VALUES('round','game','real',0,'a-copy');`);
    const kept = db.prepare("PRAGMA table_info(images)").all().map(c => String(c.name)).filter(c => !RETIRED.includes(c));
    const rows = () => db.prepare(`SELECT ${kept.join(",")} FROM images ORDER BY id`).all().map(r => ({ ...r }));
    const expected = rows().map(r => r.id === "slop" ? { ...r, description: "" } : r);
    db.exec(readFileSync(MIGRATION, "utf8"));
    assert.deepEqual(db.prepare("PRAGMA table_info(images)").all().map(c => c.name), kept);
    assert.deepEqual(rows(), expected);
    assert.equal(db.prepare("SELECT description FROM images WHERE id='real'").get()?.description, "Una strada di Roma");
    assert.equal(db.prepare("SELECT count(*) AS n FROM paid_calls").get()?.n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM game_rounds").get()?.n, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});

test("the proposed texts become current once; the history and the other parts stay", () => {
  const db = before();
  try {
    db.exec(`INSERT INTO model_contexts(id,part,body,created_at) VALUES
      ('old-base','base','Base con tag e descrizioni','2026-11-19T10:00:00.000Z'),
      ('old-analysis','analysis','Descrizione delle REAL','2026-11-19T10:00:00.000Z'),
      ('old-prompt','slop_gallery_prompt','Usa il profilo editoriale','2026-11-19T10:00:00.000Z'),
      ('evaluation','slop_evaluation','Valutazione','2026-11-19T10:00:00.000Z')`);
    db.exec(readFileSync(MIGRATION, "utf8"));
    assert.equal(current(db, "base"), DEFAULTS.base);
    // The text saved by 0066, quoted by migration 0070, which replaces it with the proposal that develops the idea of a REAL.
    const later = readFileSync("migrations/0070_remove_gallery_instructions.sql", "utf8");
    assert.equal(current(db, "slop_gallery_prompt"), later.slice(later.indexOf("LIMIT 1)='") + 10, later.lastIndexOf("';")).replaceAll("''", "'"));
    assert.equal(current(db, "slop_evaluation"), "Valutazione");
    assert.equal(current(db, "analysis"), "Descrizione delle REAL");
    assert.equal(db.prepare("SELECT count(*) AS n FROM model_contexts").get()?.n, 6);
    assert.match(String(db.prepare("SELECT created_at FROM model_contexts WHERE part='base' ORDER BY created_at DESC").get()?.created_at),
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    // Applied again, or on a database that already has the proposals: nothing new (the columns are gone, so only the inserts run).
    const inserts = readFileSync(MIGRATION, "utf8").split("UPDATE images")[0];
    db.exec(inserts);
    assert.equal(db.prepare("SELECT count(*) AS n FROM model_contexts").get()?.n, 6);
  } finally { db.close(); }
});
