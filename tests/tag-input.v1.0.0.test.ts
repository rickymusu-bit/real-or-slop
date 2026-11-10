/** v1.0.0, 2026-11-10T07:10:00Z: owner-typed tags converted when only the form is wrong (shared/tag-input.v1.0.0.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tagFromInput } from "../shared/tag-input.v1.0.0";

test("conforming tags are kept as they are", () => {
  assert.deepEqual(tagFromInput("  riot "), { ok: true, tag: "riot", converted: false });
});
test("form errors are converted", () => {
  assert.deepEqual(tagFromInput("São Paulo"), { ok: true, tag: "sao-paulo", converted: true });
  assert.deepEqual(tagFromInput("Police Car"), { ok: true, tag: "police-car", converted: true });
  assert.deepEqual(tagFromInput("Place de la République!"), { ok: true, tag: "place-de-la-republique", converted: true });
  assert.deepEqual(tagFromInput("München"), { ok: true, tag: "munchen", converted: true });
});
test("origin words and empty forms are refused", () => {
  for (const text of ["AI", "Fake", "Midjourney style", "IA"]) {
    const result = tagFromInput(text);
    assert.ok(!result.ok && /origine/.test(result.reason), text);
  }
  assert.ok(!tagFromInput("").ok);
  assert.ok(!tagFromInput("!!!").ok);
  assert.ok(!tagFromInput("untagged").ok);
});
