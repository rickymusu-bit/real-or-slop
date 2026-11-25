/** Translate unchanged shipped instructions while preserving owner edits and context history. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DEFAULTS } from "../worker/model-context";

test("English defaults replace shipped instructions once, preserving owner edits and history", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const f of readdirSync("migrations").sort().filter(f => f < "0075")) db.exec(readFileSync("migrations/" + f, "utf8"));
    const legacy: Record<string,string> = JSON.parse(readFileSync("tests/fixtures/legacy-model-contexts.json", "utf8"));
    const insert = db.prepare("INSERT INTO model_contexts(id,part,body,created_at,pipeline) VALUES(?,?,?,'2026-01-01',2)");
    db.exec("DELETE FROM model_contexts");
    for (const [part, body] of Object.entries(legacy)) insert.run(part, part, body);
    db.prepare("INSERT INTO model_contexts(id,part,body,created_at,pipeline) VALUES('owner','real_measure','Owner instructions','2026-01-02',2)").run();
    const migration = readFileSync("migrations/0075_english_model_contexts.sql", "utf8");
    const latest = (part: string) => db.prepare("SELECT body FROM model_contexts WHERE part=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(part)?.body;
    db.exec(migration);
    for (const part of ["base", "slop_gallery_prompt", "slop_evaluation"] as const) assert.equal(latest(part), DEFAULTS[part]);
    assert.equal(latest("real_measure"), "Owner instructions");
    assert.equal(latest("real_ideas"), legacy.real_ideas); // retired workflow, no automatic rewrite
    assert.equal(db.prepare("SELECT body FROM model_contexts WHERE id='base'").get()?.body, legacy.base);
    const before = db.prepare("SELECT count(*) AS n FROM model_contexts").get()?.n;
    db.exec(migration);
    assert.equal(db.prepare("SELECT count(*) AS n FROM model_contexts").get()?.n, before);
    db.exec("DELETE FROM model_contexts WHERE part='real_measure'");
    insert.run("measure", "real_measure", legacy.real_measure);
    db.exec(migration);
    assert.equal(latest("real_measure"), DEFAULTS.real_measure);
  } finally { db.close(); }
});
