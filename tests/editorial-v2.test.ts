import { test } from "node:test";
import assert from "node:assert/strict";
import contract from "./editorial-v2-contract.json";
import { validateV2Profile, validateV2Plan, validateV2Provenance, v2ApprovalBlockers } from "../shared/editorial-v2";
import worker from "../worker/index";
import { editorialV2 } from "../worker/editorial-v2";
import type { Env } from "../worker/core";

test("v2 ordinary, plausible textures need no surprise, ranking or reason for doubt", () => {
  assert.deepEqual(v2ApprovalBlockers("REAL", contract.profile, contract.real_provenance, contract.feedback), []);
  assert.equal(validateV2Profile(contract.profile).surprise, 0);
  assert.equal(validateV2Plan(contract.plan).independent, true);
});
test("v2 excludes hybrids, semantic manipulation, unresolved provenance and artwork", () => {
  for (const change of [{ authenticity: "hybrid" }, { authenticity: "uncertain" }, { authenticity: "unverified" }, { semantic_edit: true }, { content_kind: "artwork" }]) {
    assert.deepEqual(v2ApprovalBlockers("REAL", contract.profile, { ...contract.real_provenance, ...change }, contract.feedback), ["authenticity_not_verified"]);
  }
  for (const change of ["generative_fill", "crop", "restoration", "upscaling"]) assert.throws(() => validateV2Provenance({ ...contract.real_provenance, transformations: [change] }, "REAL"), /quarantena/);
});
test("v2 plan has no channel for references, REAL candidates or previous preferences", () => {
  for (const key of ["reference_id", "source_url", "reference_image", "real_candidates", "preferences", "ranking"]) {
    assert.throws(() => validateV2Plan({ ...contract.plan, ideas: [{ ...contract.plan.ideas[0], [key]: "forbidden" }] }), /campi/);
  }
  assert.throws(() => validateV2Plan({ ...contract.plan, ideas: [{ ...contract.plan.ideas[0], prompt: "https://example.invalid/photo.jpg" }] }), /riferimento/);
  for (const key of ["score", "difficulty", "label", "source", "prompt", "concrete_motive"]) assert.throws(() => validateV2Profile({ ...contract.profile, [key]: "forbidden" }), /campi/);
  for (const surprise of [true, NaN, Infinity, -1, 101]) assert.throws(() => validateV2Profile({ ...contract.profile, surprise }), /Misura/);
  assert.equal(validateV2Profile({ ...contract.profile, surprise: null }).surprise, null);
});
test("v2 feedback must cite existing evidence instead of inventing an origin proof", () => {
  assert.throws(() => v2ApprovalBlockers("REAL", contract.profile, contract.real_provenance, { ...contract.feedback, origin_evidence_ids: ["invented"] }), /evidenze/);
});
test("v2 routes remain disabled before touching unmigrated production D1", async () => {
  for (const path of ["/api/admin/editorial/v2", "/api/admin/editorial/v2/runs", "/api/admin/editorial/v2/candidates", "/api/admin/editorial/v2/publish"]) {
    const response = await worker.fetch(new Request("https://test" + path, { headers: { Authorization: "Bearer " + "x".repeat(40) } }), { ADMIN_TOKEN: "x".repeat(40) } as Env);
    assert.equal(response.status, 503);
    assert.match((await response.json() as { error: string }).error, /sperimentale non attivo/);
  }
});
test("v2 admin UI and all private media require authentication", async () => {
  for (const path of ["/admin/editorial-v2", "/api/admin/editorial/v2/candidates/private/preview"]) {
    assert.equal((await worker.fetch(new Request("https://test" + path), { ADMIN_TOKEN: "x".repeat(40) } as Env)).status, 401);
  }
});
test("v2 experiment enablement does not enable spending or publication", async () => {
  await assert.rejects(editorialV2(new Request("https://test/api/admin/editorial/v2/runs", { method: "POST", body: "{}" }), { ENABLE_EDITORIAL_V2_EXPERIMENTS: "true" } as Env, "/api/admin/editorial/v2/runs"), /pagati non abilitati/);
  await assert.rejects(editorialV2(new Request("https://test/api/admin/editorial/v2/publish", { method: "POST", body: "{}" }), { ENABLE_EDITORIAL_V2_EXPERIMENTS: "true" } as Env, "/api/admin/editorial/v2/publish"), /pubblicazione sperimentale non disponibile/);
});
