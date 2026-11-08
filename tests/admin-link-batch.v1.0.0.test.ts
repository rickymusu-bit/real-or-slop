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
// v1.1.0 (2026-11-08T20:00:26Z): Commons photo URLs are stored as their canonical File: page.
test("Commons thumbnails, originals and media viewer links become the File: page", async () => {
  const { commonsPageUrl } = await import("../shared/editorial-link-batch.v1.0.0.ts");
  const page = "https://commons.wikimedia.org/wiki/File:Manifestation_lyc%C3%A9enne_%C3%A0_Paris_105.jpg";
  assert.equal(commonsPageUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/Manifestation_lyc%C3%A9enne_%C3%A0_Paris_105.jpg/1920px-Manifestation_lyc%C3%A9enne_%C3%A0_Paris_105.jpg?utm_source=commons.wikimedia.org"), page);
  assert.equal(commonsPageUrl("https://upload.wikimedia.org/wikipedia/commons/a/a3/Manifestation_lyc%C3%A9enne_%C3%A0_Paris_105.jpg"), page);
  assert.equal(commonsPageUrl("https://commons.wikimedia.org/wiki/Category:Paris#/media/File:Manifestation_lycéenne_à_Paris_105.jpg"), page);
  assert.equal(commonsPageUrl("https://commons.wikimedia.org/wiki/File:Manifestation lycéenne à Paris 105.jpg"), page);
  assert.equal(commonsPageUrl("https://commons.wikimedia.org/w/index.php?title=File:Manifestation_lyc%C3%A9enne_%C3%A0_Paris_105.jpg&oldid=1"), page);
  assert.equal(commonsPageUrl("https://commons.wikimedia.org/wiki/Category:Paris"), null);
  assert.equal(commonsPageUrl("https://upload.wikimedia.org/wikipedia/commons/a/a3/Clip.ogv"), null);
  assert.equal(commonsPageUrl("http://upload.wikimedia.org/wikipedia/commons/a/a3/A.jpg"), null);
  assert.deepEqual(parseLinkLines(page + "\nhttps://upload.wikimedia.org/wikipedia/commons/a/a3/Manifestation_lyc%C3%A9enne_%C3%A0_Paris_105.jpg"), [page]);
  assert.equal(canAcquireCommons("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/A.jpg/800px-A.jpg"), true);
});
