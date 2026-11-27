/** Reviewed source reconstruction is explicit, hash-bound, idempotent and private. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
test("reviewed associations recover only verified matching originals and never replace retained sources", () => {
  const db = new DatabaseSync(":memory:"), migration = "0082_reviewed_source_attribution.sql";
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT)");
    for (const file of readdirSync("migrations").sort().filter(file => file < migration)) db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec("INSERT INTO galleries(id,title) VALUES('g','Test')");
    for (const [id, origin, hash] of [["r", "REAL", "a"], ["other", "REAL", "b"], ...["good", "unverified", "wrong-file", "wrong-source", "retained", "corrupt"].map((id, n) => [id, "SLOP", String(n + 3)])]) {
      db.prepare(`INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
        VALUES(?,'g',?,'new',?,?,?,'image/png',40,50,'now','now')`).run(id, origin, origin === "REAL" ? id : null, id, hash.repeat(64));
    }
    const reviewed = {source_id:"r",verified:true,method:"original_scene_review",original_sha256:"c".repeat(64),source_original_sha256:"a".repeat(64)};
    for (const [id, changes] of [["good", {}], ["unverified", {verified:false}], ["wrong-file", {original_sha256:"d".repeat(64)}], ["wrong-source", {source_original_sha256:"e".repeat(64)}], ["retained", {}]] as const)
      db.prepare("UPDATE images SET generation_slot=? WHERE id=?").run(JSON.stringify({source_attribution:{...reviewed,original_sha256:db.prepare("SELECT original_sha256 AS hash FROM images WHERE id=?").get(id)?.hash,...changes}}), id);
    db.exec("UPDATE images SET slop_source_id='other' WHERE id='retained'; UPDATE images SET generation_slot='{broken' WHERE id='corrupt'");
    const before = db.prepare("SELECT * FROM images ORDER BY id").all().map(row => {const copy = {...row};delete copy.slop_source_id;return copy;});
    db.exec(readFileSync("migrations/" + migration, "utf8"));
    assert.equal(db.prepare("SELECT slop_source_id AS source FROM images WHERE id='good'").get()?.source, "r");
    assert.equal(db.prepare("SELECT slop_source_id AS source FROM images WHERE id='retained'").get()?.source, "other");
    for (const id of ["unverified", "wrong-file", "wrong-source", "corrupt"]) assert.equal(db.prepare("SELECT slop_source_id AS source FROM images WHERE id=?").get(id)?.source, null);
    const after = db.prepare("SELECT * FROM images ORDER BY id").all().map(row => {const copy = {...row};delete copy.slop_source_id;return copy;});
    assert.deepEqual(after, before);
    const linked = db.prepare("SELECT id,slop_source_id FROM images ORDER BY id").all();
    db.exec(readFileSync("migrations/" + migration, "utf8"));
    assert.deepEqual(db.prepare("SELECT id,slop_source_id FROM images ORDER BY id").all(), linked);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {db.close();}
});
