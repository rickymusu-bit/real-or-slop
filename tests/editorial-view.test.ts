import { test } from "node:test";
import assert from "node:assert/strict";
import { editorialBatches, editorialGallery, sourcePhotoPreview, type Dossiers } from "../src/editorial-view.ts";

function fixture(): Dossiers {
  const references = Array.from({ length: 20 }, (_, n) => ({ id: `ref-${n + 1}`, role: n < 10 ? "REAL" : "SLOP", rank: n + 1, batch_id: "new-lot", created_at: "2026-11-03T13:00:00Z", source_url: "https://example.invalid/photo", metadata_json: JSON.stringify({ title: `Photo ${n + 1}` }), evaluation_json: JSON.stringify({ score: 64 - n, editorial_threshold: 65 }) }));
  const attempts = references.slice(10).map((photo, n) => ({ id: `attempt-${n}`, reference_id: photo.id, image_id: n === 0 ? "candidate" : null, dossier_json: JSON.stringify({ status: n === 0 ? "accepted" : "discarded", evaluation: { score: n === 0 ? 66.5 : 50, reason: "Specific visible reason" } }), status: n === 0 ? "in-review" : null, published_at: null, media_available: 1 }));
  return { references: [...references, { ...references[0], id: "old", batch_id: "old-lot", created_at: "2026-11-02T00:00:00Z" }], attempts };
}

test("latest lot shows every REAL photograph and every SLOP with its actual source, including discarded outputs", () => {
  const data = fixture();
  assert.equal(editorialBatches(data)[0].id, "new-lot");
  assert.equal(editorialBatches(data)[0].photos, 20);
  assert.equal(editorialBatches(data)[0].generated, 10);
  const html = editorialGallery(data, "new-lot");
  assert.equal((html.match(/<article /g) || []).length, 20);
  assert.equal((html.match(/<img /g) || []).length, 30);
  assert.equal((html.match(/Fotografia sorgente del prompt/g) || []).length, 10);
  assert.equal((html.match(/Scartata \/ errore/g) || []).length, 9);
  assert.ok(html.includes("references/ref-11/preview"));
  assert.ok(html.includes("attempts/attempt-0/preview"));
  assert.ok(html.includes("Sotto soglia editoriale"));
  assert.ok(!html.includes("data-reference-id=\"old\""));
  assert.ok(!html.includes("<details><summary>Photo"));
});

test("missing historical files never create a broken generated image or imply human approval", () => {
  const data = fixture();
  data.attempts[0].image_id = null;
  data.attempts[0].media_available = 0;
  const html = editorialGallery(data, "new-lot");
  assert.ok(html.includes("File della generazione non archiviato"));
  assert.ok(!html.includes("attempts/attempt-0/preview"));
  assert.ok(html.includes("Sopra soglia · da rivedere"));
  assert.ok(!html.includes("Approvata, in attesa"));
});

test("source photo rendering uses only authenticated image paths and escapes source metadata", () => {
  const html = sourcePhotoPreview({ id: 'source/"x', title: '<img src=x onerror="alert(1)">', source_url: "javascript:alert(1)" });
  assert.ok(html.includes("source%2F%22x/preview"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('<img src=x'));
  assert.equal(sourcePhotoPreview(null), "");
});
