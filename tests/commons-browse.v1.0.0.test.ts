// v1.0.0 (2026-11-08T23:10:00Z): Commons browsing against the response shape observed on the live API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { browseFiles, commonsMediaUrl } from "../worker/commons-editorial.v1.0.0.ts";

const utm = "?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail";
const live = { query: { pages: [{
  title: "File:Protest à Paris 61.jpg", index: 2,
  categories: [{ title: "Category:Demonstrations in Paris" }, { title: "Category:Protest à Paris" }],
  imageinfo: [{ size: 13856403, width: 6000, height: 4000,
    thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Protest_%C3%A0_Paris_61.jpg/500px-Protest_%C3%A0_Paris_61.jpg" + utm,
    url: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Protest_%C3%A0_Paris_61.jpg" + utm.replace("thumbnail", "original"),
    extmetadata: { Artist: { value: "<a href='x'>Author</a>" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] },
  { title: "File:Small.png", index: 1, imageinfo: [{ width: 800, height: 600,
    thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/Small.png/500px-Small.png" + utm,
    url: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Small.png" + utm }] },
  { title: "File:Elsewhere.jpg", index: 3, imageinfo: [{ width: 9000, height: 9000, thumburl: "https://example.org/wikipedia/commons/x.jpg" }] }] } };

test("live thumbnails on thumb.wikimedia.org are kept, cleaned and previewed", () => {
  const files = browseFiles(live);
  assert.deepEqual(files.map(f => f.title), ["File:Small.png", "File:Protest à Paris 61.jpg"]);
  const big = files[1];
  assert.equal(big.thumb_url, "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Protest_%C3%A0_Paris_61.jpg/500px-Protest_%C3%A0_Paris_61.jpg");
  assert.equal(big.preview_url, "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Protest_%C3%A0_Paris_61.jpg/1280px-Protest_%C3%A0_Paris_61.jpg");
  assert.equal(files[0].preview_url, "https://upload.wikimedia.org/wikipedia/commons/b/b1/Small.png");
  assert.equal(big.author, "Author");
  assert.deepEqual(big.categories, ["Demonstrations in Paris", "Protest à Paris"]);
});
test("media URLs are limited to the Commons tree on the two media hosts", () => {
  assert.equal(commonsMediaUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/A.jpg/500px-A.jpg?utm_source=x"),
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/A.jpg/500px-A.jpg");
  assert.equal(commonsMediaUrl("https://upload.wikimedia.org/wikipedia/en/a/a9/A.jpg"), null);
  assert.equal(commonsMediaUrl("http://upload.wikimedia.org/wikipedia/commons/a/a9/A.jpg"), null);
  assert.equal(commonsMediaUrl("https://upload.wikimedia.org:8443/wikipedia/commons/a/a9/A.jpg"), null);
  assert.equal(commonsMediaUrl("https://evil.example/wikipedia/commons/a/a9/A.jpg"), null);
});
