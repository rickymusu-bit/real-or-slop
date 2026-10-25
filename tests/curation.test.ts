import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { curationChoices, curationTextLimits } from "../shared/curation.ts";
import { validateCuration } from "../worker/curation.ts";

test("editorial dimensions are optional, distinct from verified facts", () => {
  const values = validateCuration({ curation: { represented_place: "Scena immaginaria", familiarity: "bassa" } });
  assert.equal(values.represented_place, "Scena immaginaria");
  assert.equal(values.verified_place, null);
  assert.equal(values.subject_kind, null);
  assert.equal(values.familiarity, "bassa");
  assert.ok(Object.values(validateCuration({ curation: {} })).every((value) => value === null));
});
test("verified places and dates require evidence and explicit human confirmation", () => {
  for (const field of ["verified_place", "verified_date"] as const) {
    assert.throws(() => validateCuration({ curation: { [field]: "Dato" } }));
    assert.throws(() => validateCuration({ curation: { [field]: "Dato", fact_evidence: "Scheda archivistica" } }));
    assert.equal(validateCuration({ curation: { [field]: "Dato", fact_evidence: "Scheda archivistica" }, facts_confirmed: true })[field], "Dato");
  }
});
test("API rejects unknown fields, invented vocabularies, wrong types and oversized text", () => {
  for (const curation of [null, [], { revision: 999 }, { difficulty: "esperto" }, { reviewer: "spoofed" }, { reviewer_notes: 12 }, { familiarity: "ALTA" }]) {
    assert.throws(() => validateCuration({ curation }));
  }
  for (const [key, limit] of Object.entries(curationTextLimits)) {
    assert.throws(() => validateCuration({ curation: { [key]: "x".repeat(limit + 1) } }));
  }
});
test("shared controlled vocabularies agree with SQLite constraints", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE images(id TEXT PRIMARY KEY); INSERT INTO images VALUES('fixture')");
  db.exec(readFileSync("migrations/0004_image_curation.sql", "utf8"));
  db.exec("INSERT INTO image_curation(image_id,revision,reviewer,updated_at) VALUES('fixture',1,'reviewer','date')");
  for (const [field, choices] of Object.entries(curationChoices)) {
    for (const choice of choices) {
      validateCuration({ curation: { [field]: choice } });
      db.prepare(`UPDATE image_curation SET ${field}=?`).run(choice);
    }
    assert.throws(() => db.prepare(`UPDATE image_curation SET ${field}=?`).run("invalid"));
    assert.throws(() => validateCuration({ curation: { [field]: "invalid" } }));
  }
  db.close();
});
