/** v1.0.0, 2026-11-10T22:11:48Z: slot extraction of the SLOP studio (shared/slot-extraction.v1.0.0.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSlots, spreadFactor, type TaggedImage } from "../shared/slot-extraction.v1.0.0";
import type { Category } from "../shared/tag-categories.v1.0.0";

const img = (tags: Record<string, Category>): TaggedImage => ({ tags: new Map(Object.entries(tags)) });
/** Deterministic random source. */
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const images = [
  ...Array.from({ length: 4 }, (_, i) => img({ riot: "event", "1940s": "time", [["paris", "milano", "paris", "torino"][i]]: "place", [["tram", "barricade", "bicycle", "barricade"][i]]: "object" })),
  ...Array.from({ length: 6 }, (_, i) => img({ riot: "event", "2010s": "time", [["athens", "london", "athens", "paris", "london", "athens"][i]]: "place", [["smartphone", "car", "car", "smartphone", "car", "flags"][i]]: "object" })),
  img({ beach: "setting", "1970s": "time", rimini: "place" }),
];

test("spread factor: double for the most missing, neutral at zero, a quarter for the most exceeding", () => {
  assert.equal(spreadFactor(10, 10), 2);
  assert.equal(spreadFactor(0, 10), 1);
  assert.equal(spreadFactor(-10, 10), 0.25);
  assert.equal(spreadFactor(0, 0), 1);
});
test("the theme narrows the reference and its categories are skipped", () => {
  const { slots, reference } = extractSlots({ images, spread: new Map(), theme: ["riot"], count: 10, random: seeded(1) });
  assert.equal(reference, 10);
  for (const slot of slots) {
    assert.ok(!("event" in slot), "the theme covers Event");
    assert.ok(!["beach", "rimini", "1970s"].some(t => Object.values(slot).includes(t)), "never from images without the theme");
  }
});
test("narrowing keeps the epoch coherent: no smartphone in the 1940s", () => {
  for (let seed = 1; seed < 40; seed++) {
    for (const slot of extractSlots({ images, spread: new Map(), theme: ["riot"], count: 3, random: seeded(seed) }).slots) {
      if (slot.time === "1940s") assert.ok(!["smartphone", "car", "flags"].includes(slot.object!), JSON.stringify(slot));
      if (slot.time === "2010s") assert.ok(!["tram", "bicycle"].includes(slot.object!), JSON.stringify(slot));
    }
  }
});
test("no duplicate combinations in a group while alternatives exist", () => {
  const { slots } = extractSlots({ images, spread: new Map(), theme: ["riot"], count: 8, random: seeded(7) });
  assert.equal(new Set(slots.map(s => JSON.stringify(s))).size, 8);
});
test("the spread steers the draw", () => {
  const spread = new Map([["1940s", 20], ["2010s", -20]]);
  let forties = 0;
  for (let seed = 1; seed <= 200; seed++) if (extractSlots({ images, spread, theme: ["riot"], count: 1, random: seeded(seed) }).slots[0].time === "1940s") forties++;
  assert.ok(forties > 140, String(forties));  // weights 2·√4 against 0.25·√6: about 87%
});
test("existing slots count for variety; at most 10 slots", () => {
  const first = extractSlots({ images, spread: new Map(), theme: ["riot", "1940s"], count: 1, random: seeded(3) }).slots;
  const more = extractSlots({ images, spread: new Map(), theme: ["riot", "1940s"], count: 30, existing: first, random: seeded(3) });
  assert.equal(more.slots.length, 10);
  assert.ok(more.slots.every(s => !("time" in s)), "a decade in the theme covers Time");
});
