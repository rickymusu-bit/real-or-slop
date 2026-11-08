import { test } from "node:test";
import assert from "node:assert/strict";
import { canAcquireCommons, normalizeLinkBatch, parseLinkLines } from "../shared/editorial-link-batch.v1.0.0.ts";

test("multiline HTTPS links normalize and deduplicate", () => {
  assert.deepEqual(parseLinkLines("\n https://example.org/a\nhttps://example.org/a\nhttps://example.org/b\n"),
    ["https://example.org/a","https://example.org/b"]);
});
test("invalid input rejects the whole batch", () => {
  assert.throws(() => parseLinkLines("https://example.org/a\nhttp://example.org/b"),/Link 2/);
  assert.throws(() => normalizeLinkBatch([]),/1 a 20/);
  assert.throws(() => normalizeLinkBatch(Array(21).fill("https://example.org/a")),/1 a 20/);
  assert.throws(() => parseLinkLines("https://example.org/a#anchor"),/Link 1/);
});
test("Commons acquisition recognizes only supported file URL families", () => {
  assert.equal(canAcquireCommons("https://commons.wikimedia.org/wiki/File:Fixture.jpg"),true);
  assert.equal(canAcquireCommons("https://commons.wikimedia.org/wiki/Special:FilePath/Fixture.jpg"),true);
  assert.equal(canAcquireCommons("https://commons.wikimedia.org/wiki/Category:Europe"),false);
  assert.equal(canAcquireCommons("https://example.org/a.jpg"),false);
});
