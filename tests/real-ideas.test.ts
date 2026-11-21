/** Ideas of falsification (owner decisions of 2026-11-21): the extraction corrected on crowding and detail, and migration 0069, whose
 * triggers keep the link between a REAL and its process until the process ends and mark the idea as used when its SLOP is accepted. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { binOf, extractionWeights, weightedSample } from "../shared/idea-sampling";

test("scores fall into three bins per axis", () => {
  assert.deepEqual([0, 33, 34, 66, 67, 100].map(binOf), [0, 0, 1, 1, 2, 2]);
});

test("a bin with fewer SLOP than its share of REAL weighs more, within 0.25 and 4; no measure weighs 1", () => {
  const simple = { crowdedness: 0, detail: 40 }, crowded = { crowdedness: 80, detail: 40 };
  // Half the REAL are crowded, every SLOP so far simple: crowded candidates weigh more than simple ones.
  const reals = [simple, simple, crowded, crowded], slops = [simple, simple, simple, simple];
  const [w1, w2, w3] = extractionWeights([simple, crowded, null], reals, slops);
  assert.ok(w2 > 1 && w1 < 1 && w3 === 1, JSON.stringify([w1, w2, w3]));
  // With the SLOP matching the REAL, every weight is 1.
  assert.deepEqual(extractionWeights([simple, crowded], reals, reals), [1, 1]);
  // Extreme gaps are bounded per axis.
  const many = Array(200).fill(simple);
  const [bounded] = extractionWeights([crowded], Array(200).fill(crowded), many);
  assert.ok(bounded <= 16 + 1e-9 && bounded >= 1, String(bounded));
});

test("the weighted draw returns distinct indices and favours heavier weights", () => {
  let seed = 7;
  const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const picks = [0, 0, 0];
  for (let n = 0; n < 3000; n++) {
    const [first] = weightedSample([1, 4, 1], 1, random);
    picks[first]++;
  }
  assert.ok(picks[1] > picks[0] * 2.5 && picks[1] > picks[2] * 2.5, JSON.stringify(picks));
  const all = weightedSample([1, 2, 3, 4], 4, random);
  assert.deepEqual([...all].sort(), [0, 1, 2, 3]);
});

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
