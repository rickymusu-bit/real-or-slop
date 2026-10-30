import { test } from "node:test";
import assert from "node:assert/strict";
import { recognizedLicense } from "../shared/licenses.ts";
import licenses from "../shared/licenses.json";
import cases from "./license-cases.json";

test("published license identities preserve versions and jurisdictions across URL aliases", () => {
  for (const { input, url, name } of cases.accepted)
    assert.deepEqual(recognizedLicense(input), { url, name }, input);
  for (const [url, name] of Object.entries(licenses))
    assert.deepEqual(recognizedLicense(url), { url, name }, url);
});

test("NC, ND, unknown ports, ambiguous paths and forged hosts stay unrecognized", () => {
  for (const value of cases.rejected)
    assert.equal(recognizedLicense(value), null, JSON.stringify(value));
});
