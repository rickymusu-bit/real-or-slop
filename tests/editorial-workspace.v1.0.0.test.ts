import assert from "node:assert/strict";
import test from "node:test";
import { editorialWorkspaceVersion, imageMime, isolatedSlopPlanningInput, sourcePageUrl, topicKey, topicTitle } from "../shared/editorial-workspace.v1.0.0";

test("workspace version and topic normalization preserve concrete subject/time", () => {
  assert.equal(editorialWorkspaceVersion, "1.0.0");
  assert.equal(topicTitle("  Proteste   a Bruxelles, ottobre 2026  "), "Proteste a Bruxelles, ottobre 2026");
  assert.equal(topicKey("  PROTESTE A BRUXELLES, ottobre 2026 "), topicKey("proteste a bruxelles, ottobre 2026"));
  assert.throws(() => topicTitle("   "), /Argomento/);
  assert.throws(() => topicTitle("x"), /Argomento/);
});
test("source URLs are HTTPS only and never silently interpreted as licensed", () => {
  assert.equal(sourcePageUrl("https://commons.wikimedia.org/wiki/File:Example.jpg"), "https://commons.wikimedia.org/wiki/File:Example.jpg");
  for (const url of ["http://site.test/a", "file:///tmp/x", "https://user:pass@site.test/x",
    "javascript:alert(1)", "https://site.test/photo#unsafe"]) assert.throws(() => sourcePageUrl(url));
});
test("binary header checks block active HTML/SVG without forcing square crops", () => {
  assert.equal(imageMime(Uint8Array.from([0xff,0xd8,0xff,0xe0,1,2,3,4,5,6,7,8])), "image/jpeg");
  assert.equal(imageMime(Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])), "image/png");
  assert.equal(imageMime(new TextEncoder().encode("RIFF____WEBPVP8 ")), "image/webp");
  assert.equal(imageMime(new TextEncoder().encode("<svg onload=alert(1)>")), null);
});
test("SLOP prompt planning input rejects REAL contamination at boundary", () => {
  const allowed = { topic:"Proteste a Bruxelles, ottobre 2026", taxonomy_version:"1.0.0",
    slop_feedback:["Prefer candid camera composition"] };
  assert.deepEqual(isolatedSlopPlanningInput(allowed), allowed);
  assert.throws(() => isolatedSlopPlanningInput({ ...allowed, real_candidates:["https://example.org/a.jpg"] }), /non ammessi/);
  assert.throws(() => isolatedSlopPlanningInput({ ...allowed, real_photo_description:"firefighters beside car" }), /non ammessi/);
  assert.throws(() => isolatedSlopPlanningInput({ ...allowed, real_feedback:["approved"] }), /non ammessi/);
  assert.throws(() => isolatedSlopPlanningInput({ ...allowed, slop_feedback:Array(51).fill("good") }), /non valido/);
});
