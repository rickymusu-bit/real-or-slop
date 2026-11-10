/** v1.0.0, 2026-11-10T06:23:49Z: soft limit and ceiling of captions (shared/caption.v1.0.0.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTION_MAX, captionCount, fitCaption } from "../shared/caption.v1.0.0";

test("captions up to the ceiling are kept whole, over the soft limit too", () => {
  const long = "Roma, 1960. " + "Una folla attraversa la piazza sotto la pioggia. ".repeat(4);
  assert.ok(long.trim().length > 160 && long.trim().length <= CAPTION_MAX);
  assert.deepEqual(fitCaption(long), { caption: long.trim(), shortened: false });
  assert.deepEqual(fitCaption("  Due\nrighe   qui. "), { caption: "Due righe qui.", shortened: false });
});
test("over the ceiling: cut at a sentence end, never mid-word", () => {
  const text = "Milano, 1975. " + "Un corteo percorre il centro con striscioni e bandiere. ".repeat(6);
  const { caption, shortened } = fitCaption(text);
  assert.ok(shortened && caption.length <= CAPTION_MAX && caption.endsWith("."), caption);
  assert.ok(text.startsWith(caption));
});
test("over the ceiling without a usable sentence end: cut at a word, with an ellipsis", () => {
  const text = "Una lunghissima frase senza punti " + "che continua ancora e ancora ".repeat(12);
  const { caption, shortened } = fitCaption(text);
  assert.ok(shortened && caption.length <= CAPTION_MAX && caption.endsWith("…"), caption);
  assert.ok(text.startsWith(caption.slice(0, -1)) && !/\s$/.test(caption.slice(0, -1)));
  assert.equal(text[caption.length - 1], " ");
});
test("counter for the editors", () => {
  assert.deepEqual(captionCount("x".repeat(142)), { label: "142/160", over: false });
  assert.deepEqual(captionCount("x".repeat(161)), { label: "161/160, oltre il limite consigliato", over: true });
});
