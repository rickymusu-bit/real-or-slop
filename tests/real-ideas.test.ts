/** Ideas of falsification (owner decisions of 2026-11-21): migration 0069, whose
 * triggers keep the link between a REAL and its process until the process ends and mark the idea as used when its SLOP is accepted. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
const migrated = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("migrations").sort().filter(file => file < "0070")) db.exec(readFileSync("migrations/" + file, "utf8"));
  db.exec(`INSERT INTO galleries(id,title,slop_instructions) VALUES('g','Console','x');
    INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
      VALUES('real','g','REAL','new','Game Boy','k','${"a".repeat(64)}','image/png',40,50,'now','now');
    INSERT INTO real_ideas(id,image_id,gallery_id,gallery_revision,idea,genre,changes,status,model,base_context,ideas_context,created_at)
      VALUES('i1','real','g',0,'Idea uno','Collezione','Ambiente','approved','m','b','c','now'),('i2','real','g',0,'Idea due','Collezione','Ambiente','approved','m','b','c','now');
    INSERT INTO slop_batches(id,theme,slots,created_at,updated_at,origin,gallery_id,gallery_review) VALUES('batch','[]','[]','now','now','auto','g','pending');
    INSERT INTO slop_processes(id,batch_id,slot,state,premise,snapshot,created_at,updated_at) VALUES('p1','batch',0,'ready','Premessa','{}','now','now'),('p2','batch',1,'failed',NULL,'{}','now','now');
    INSERT INTO slop_gallery_sources(process_id,source_id,revision,idea_id) VALUES('p1','real',0,'i1'),('p2','real',0,'i2');`);
  return db;
};
const links = (db: DatabaseSync) => db.prepare("SELECT process_id FROM slop_gallery_sources ORDER BY process_id").all().map(r => r.process_id);
const status = (db: DatabaseSync, idea: string) => db.prepare("SELECT status FROM real_ideas WHERE id=?").get(idea)?.status;

test("confirming keeps the links of the processes that will generate; accepting marks the idea as used", () => {
  const db = migrated();
  try {
    db.exec("UPDATE slop_batches SET gallery_review='confirmed',updated_at='later'");
    assert.deepEqual(links(db), ["p1"]);
    assert.equal(db.prepare("SELECT state FROM slop_processes WHERE id='p2'").get()?.state, "closed");
    db.exec("UPDATE slop_processes SET state='running' WHERE id='p1'");
    assert.deepEqual(links(db), ["p1"]);
    db.exec("UPDATE slop_processes SET state='accepted',updated_at='done' WHERE id='p1'");
    assert.deepEqual(links(db), []);
    assert.equal(status(db, "i1"), "used");
    assert.equal(db.prepare("SELECT used_at FROM real_ideas WHERE id='i1'").get()?.used_at, "done");
    assert.equal(status(db, "i2"), "approved");
  } finally { db.close(); }
});

test("a process closed without a SLOP, or a cancelled batch, frees the idea", () => {
  const db = migrated();
  try {
    db.exec("UPDATE slop_batches SET gallery_review='confirmed'; UPDATE slop_processes SET state='exhausted' WHERE id='p1'");
    assert.deepEqual(links(db), ["p1"]);
    db.exec("UPDATE slop_processes SET state='closed' WHERE id='p1'");
    assert.deepEqual(links(db), []);
    assert.equal(status(db, "i1"), "approved");
  } finally { db.close(); }
  const cancelled = migrated();
  try {
    cancelled.exec("UPDATE slop_batches SET gallery_review='cancelled'");
    assert.deepEqual(links(cancelled), []);
    assert.deepEqual(cancelled.prepare("SELECT status FROM real_ideas ORDER BY id").all().map(r => r.status), ["approved", "approved"]);
    // Deleting the REAL deletes its ideas.
    cancelled.exec("DELETE FROM images WHERE id='real'");
    assert.equal(cancelled.prepare("SELECT count(*) AS n FROM real_ideas").get()?.n, 0);
    assert.deepEqual(cancelled.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { cancelled.close(); }
});

test("migration 0070 removes the gallery instructions and the revision on ideas, keeping galleries and ideas", () => {
  const db = migrated();
  try {
    // Migration 0066 has already saved the text that 0070 replaces.
    const sql = readFileSync("migrations/0070_remove_gallery_instructions.sql", "utf8");
    const saved = sql.slice(sql.indexOf("LIMIT 1)='") + 10, sql.lastIndexOf("';")).replaceAll("''", "'");
    assert.equal(db.prepare("SELECT body FROM model_contexts WHERE part='slop_gallery_prompt' ORDER BY created_at DESC,rowid DESC").get()?.body, saved);
    db.exec(sql);
    assert.ok(!db.prepare("PRAGMA table_info(galleries)").all().some(c => c.name === "slop_instructions"));
    assert.ok(!db.prepare("PRAGMA table_info(real_ideas)").all().some(c => c.name === "gallery_revision"));
    assert.deepEqual({ ...db.prepare("SELECT id,title FROM galleries").get() }, { id: "g", title: "Console" });
    assert.equal(db.prepare("SELECT count(*) AS n FROM real_ideas").get()?.n, 2);
    const prompts = db.prepare("SELECT body FROM model_contexts WHERE part='slop_gallery_prompt' ORDER BY created_at,rowid").all().map(r => r.body);
    assert.equal(prompts.length, 2);
    assert.match(String(prompts[1]), /idea approvata/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
