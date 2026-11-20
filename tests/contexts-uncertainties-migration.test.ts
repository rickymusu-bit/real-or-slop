/** Migration 0064 saves the proposed «Base comune» and «Descrizione delle REAL» as current versions, once, and drops the
 * uncertainties from the editorial descriptions (owner requests of 2026-11-20). */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DEFAULTS } from "../worker/model-context";

const MIGRATION = "migrations/0064_context_and_description_without_uncertainties.sql";
const before = (db: DatabaseSync) => {
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("migrations").sort().filter(file => file < "0064")) db.exec(readFileSync("migrations/" + file, "utf8"));
};
const current = (db: DatabaseSync, part: string) =>
  db.prepare("SELECT body FROM model_contexts WHERE part=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(part)?.body;

test("the proposals become the current versions and the history stays", () => {
  const db = new DatabaseSync(":memory:");
  try {
    before(db);
    db.exec(`INSERT INTO model_contexts(id,part,body,created_at) VALUES
      ('old-base','base','Base con le regole dei tag','2026-11-19T10:00:00.000Z'),
      ('old-analysis','analysis','Tag: da 5 a 15','2026-11-19T10:00:00.000Z'),
      ('evaluation','slop_evaluation','Valutazione','2026-11-19T10:00:00.000Z')`);
    db.exec(readFileSync(MIGRATION, "utf8"));
    assert.equal(current(db, "base"), DEFAULTS.base);
    assert.equal(current(db, "analysis"), DEFAULTS.analysis);
    assert.equal(current(db, "slop_evaluation"), "Valutazione");
    assert.equal(db.prepare("SELECT count(*) AS n FROM model_contexts").get()?.n, 5);
    const saved = db.prepare("SELECT created_at,pipeline FROM model_contexts WHERE part='base' ORDER BY created_at DESC LIMIT 1").get();
    assert.match(String(saved?.created_at), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.equal(saved?.pipeline, 2);
    // Applied again (or on a database already on the proposal): nothing new.
    db.exec(readFileSync(MIGRATION, "utf8"));
    assert.equal(db.prepare("SELECT count(*) AS n FROM model_contexts").get()?.n, 5);
  } finally { db.close(); }
});

test("an empty database receives the proposals", () => {
  const db = new DatabaseSync(":memory:");
  try {
    before(db);
    db.exec(readFileSync(MIGRATION, "utf8"));
    assert.equal(current(db, "base"), DEFAULTS.base);
    assert.equal(current(db, "analysis"), DEFAULTS.analysis);
  } finally { db.close(); }
});

test("the uncertainties leave descriptions and provenance; everything else stays", () => {
  const db = new DatabaseSync(":memory:");
  try {
    before(db);
    db.exec(`INSERT INTO galleries(id,title,slop_instructions) VALUES('gallery','Strade','');
      INSERT INTO images(id,gallery_id,origin,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at,
          real_description,real_description_provenance)
        VALUES('described','gallery','REAL','A','a',lower(hex(randomblob(32))),'image/png',40,50,'now','now',
          '{"visible":"Una strada","documented_context":"Roma","uncertainties":"Data incerta"}',
          '{"model":"m","image":"original","generated":{"visible":"Una strada","documented_context":"Roma","uncertainties":"Data incerta"}}'),
        ('plain','gallery','REAL','B','b',lower(hex(randomblob(32))),'image/png',40,50,'now','now',NULL,NULL)`);
    db.exec(readFileSync(MIGRATION, "utf8"));
    const row = db.prepare("SELECT real_description,real_description_provenance FROM images WHERE id='described'").get()!;
    assert.deepEqual(JSON.parse(String(row.real_description)), { visible: "Una strada", documented_context: "Roma" });
    assert.deepEqual(JSON.parse(String(row.real_description_provenance)),
      { model: "m", image: "original", generated: { visible: "Una strada", documented_context: "Roma" } });
    assert.equal(db.prepare("SELECT real_description FROM images WHERE id='plain'").get()?.real_description, null);
  } finally { db.close(); }
});
