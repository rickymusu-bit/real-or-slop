import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlopPrompt, proposeSlopReveal, validGenerationDate } from "../shared/slop.ts";
import { slopProposals, validateSlopImport, validateSlopPlan } from "../worker/slop-validation.ts";
import { slopChecks, slopFixture } from "./slop-fixtures.ts";

test("four editorial templates retain cognitive constraints and verified-context boundaries", () => {
  for (const profile of ["facile", "medio", "difficile", "esperto"]) {
    const plan = validateSlopPlan({ ...slopFixture(), profile, cognitive_mechanism: profile === "facile" || profile === "medio" ? "chronology_device" : "fictional_artifact" });
    const text = buildSlopPrompt(plan);
    assert.match(text, /fonti documentano soltanto il contesto/);
    assert.match(text, /Non inventare fonti/);
    assert.match(text, /scene innocue/);
    assert.match(text, /Trattamento confrontabile con il catalogo REAL/);
    if (profile === "facile") assert.match(text, /un solo indizio verificabile/);
    if (profile === "medio") assert.match(text, /incongruenze sottili/);
    if (profile === "difficile") assert.match(text, /Nessun errore tecnico intenzionale/);
    if (profile === "esperto") assert.match(text, /SOLO PROFILO EDITORIALE SPERIMENTALE/);
  }
});
test("drafts may be incomplete but never invent sources; full manual prompt is preserved", () => {
  const draft = validateSlopPlan({ title: "Bozza" });
  assert.match(slopProposals(draft).prompt, /Nessun fatto documentato fornito/);
  assert.match(proposeSlopReveal(draft), /Contesto non ancora documentato/);
  assert.equal(validateSlopPlan(slopFixture()).prompt, slopFixture().prompt);
  assert.throws(() => validateSlopImport(draft, slopChecks));
});
test("unknown fields, invalid types, sources and incompatible hard mechanisms are rejected", () => {
  for (const value of [null, [], { title: "x", status: "approved" },
    { ...slopFixture(), profile: "pubblico-esperto" }, { ...slopFixture(), owner_declaration: "true" },
    { ...slopFixture(), iteration: 0 }, { ...slopFixture(), profile: "difficile", cognitive_mechanism: "visual_inconsistency" },
    { ...slopFixture(), prompt: "x".repeat(8001) }, { ...slopFixture(), documented_facts: [{ fact: "a", source_title: "b", reference_url: "javascript:alert(1)" }] },
    { ...slopFixture(), documented_facts: Array(7).fill(slopFixture().documented_facts[0]) },
  ]) assert.throws(() => validateSlopPlan(value));
});
test("generation dates require actual calendar days and cannot be future at import", () => {
  assert.ok(validGenerationDate("2024-02-29"));
  for (const value of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-10-25T12:00:00Z", "tomorrow"])
    assert.equal(validGenerationDate(value), false);
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.throws(() => validateSlopImport(validateSlopPlan({ ...slopFixture(), generation_date: future }), slopChecks));
});
test("manual import requires human checks and complete provenance; Expert stays template-only", () => {
  const plan = validateSlopPlan(slopFixture());
  assert.doesNotThrow(() => validateSlopImport(plan, slopChecks));
  for (const key of Object.keys(slopChecks)) assert.throws(() => validateSlopImport(plan, { ...slopChecks, [key]: false }));
  assert.throws(() => validateSlopImport({ ...plan, owner_declaration: false }, slopChecks));
  assert.throws(() => validateSlopImport({ ...plan, ai_model: "" }, slopChecks));
  assert.throws(() => validateSlopImport({ ...plan, prompt: "[Da compilare e verificare dal revisore]" }, slopChecks));
  assert.throws(() => validateSlopImport({ ...plan, profile: "esperto", cognitive_mechanism: "fictional_event" }, slopChecks));
});
