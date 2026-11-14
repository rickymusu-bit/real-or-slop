/** Slot extraction of the SLOP studio (shared/slot-extraction.ts): the caller gives the REAL of one group. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSlots, SLOT_ORDER, spreadFactor, type TaggedImage } from "../shared/slot-extraction";
import type { Category } from "../shared/tag-categories";

let n = 0;
const img = (tags: Record<string, Category>): TaggedImage => ({ id: "r" + ++n, tags: new Map(Object.entries(tags)) });
/** Deterministic random source. */
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
// A group «press-photo/1960s»: printed pages with trams and barricades, colour slides with cars.
const images = [
  ...Array.from({ length: 4 }, (_, i) => img({ riot: "event", "newspaper-print": "medium", "black-and-white": "color",
    [["paris", "milano", "paris", "torino"][i]]: "place", [["tram", "barricade", "bicycle", "barricade"][i]]: "object" })),
  ...Array.from({ length: 6 }, (_, i) => img({ riot: "event", slide: "medium", color: "color",
    [["athens", "london", "athens", "paris", "london", "athens"][i]]: "place", [["car", "bus", "bus", "car", "bus", "flags"][i]]: "object" })),
  img({ beach: "setting", "photo-print": "medium", rimini: "place" }),
];

test("Genre and Time are the group's: slots draw Color, Medium and the subject categories", () => {
  assert.deepEqual([...SLOT_ORDER], ["color", "medium", "place", "setting", "event", "people", "object"]);
});
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
    assert.ok(!["beach", "rimini", "photo-print"].some(t => Object.values(slot).includes(t)), "never from images without the theme");
  }
});
test("without a theme every image of the group is a reference", () => {
  assert.equal(extractSlots({ images, spread: new Map(), theme: [], count: 2, random: seeded(2) }).reference, 11);
});
test("narrowing keeps the medium coherent: no car on a printed page of trams", () => {
  for (let seed = 1; seed < 40; seed++) {
    for (const slot of extractSlots({ images, spread: new Map(), theme: ["riot"], count: 3, random: seeded(seed) }).slots) {
      if (slot.medium === "newspaper-print") assert.ok(!["car", "bus", "flags"].includes(slot.object!), JSON.stringify(slot));
      if (slot.medium === "slide") assert.ok(!["tram", "bicycle"].includes(slot.object!), JSON.stringify(slot));
    }
  }
});
test("no duplicate combinations in a batch while alternatives exist", () => {
  const { slots } = extractSlots({ images, spread: new Map(), theme: ["riot"], count: 8, random: seeded(7) });
  const tagsOnly = slots.map(({ sample: _sample, ...tags }) => JSON.stringify(tags));
  assert.equal(new Set(tagsOnly).size, 8);
});
test("the spread steers the draw", () => {
  const spread = new Map([["black-and-white", 20], ["color", -20]]);
  let printed = 0;
  for (let seed = 1; seed <= 200; seed++) if (extractSlots({ images, spread, theme: ["riot"], count: 1, random: seeded(seed) }).slots[0].color === "black-and-white") printed++;
  assert.ok(printed > 140, String(printed));  // weights 2·√4 against 0.25·√6: about 87%
});
test("existing slots count for variety; at most 10 slots", () => {
  const first = extractSlots({ images, spread: new Map(), theme: ["riot", "slide"], count: 1, random: seeded(3) }).slots;
  const more = extractSlots({ images, spread: new Map(), theme: ["riot", "slide"], count: 30, existing: first, random: seeded(3) });
  assert.equal(more.slots.length, 10);
  assert.ok(more.slots.every(s => !("medium" in s)), "a medium in the theme covers Medium");
});
test("the REAL campione has the slot's Medium and Color, a different one per slot while there are any", () => {
  const byId = new Map(images.map(i => [i.id!, i]));
  for (let seed = 1; seed < 20; seed++) {
    const { slots } = extractSlots({ images, spread: new Map(), theme: ["riot"], count: 4, random: seeded(seed) });
    for (const slot of slots) {
      const sample = byId.get(slot.sample!);
      assert.ok(sample, "every slot has a sample");
      if (slot.medium) assert.ok(sample!.tags.has(slot.medium), JSON.stringify(slot));
      if (slot.color) assert.ok(sample!.tags.has(slot.color), JSON.stringify(slot));
    }
    const samples = slots.map(s => s.sample);
    const fitting = (m?: string) => images.filter(i => i.tags.has("riot") && (!m || i.tags.has(m))).length;
    if (slots.every(s => s.medium === slots[0].medium) && fitting(slots[0].medium) >= 4) assert.equal(new Set(samples).size, 4);
  }
});
