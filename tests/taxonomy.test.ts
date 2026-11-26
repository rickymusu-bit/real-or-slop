import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETER_KEYS, type Profile } from "../shared/pipeline";
import { TAXONOMY_KEYS, applyTaxonomy, classificationSchema, cleanTaxonomy, mapCategory, pendingKeys, profileSchema, statCategory } from "../shared/taxonomy";
import { compare, otherShare, seeded, totalVariation } from "../shared/pipeline-metrics";

const profile = (genre: string, colour: string): Profile => ({ genre, peculiarities: [], parameters: Object.fromEntries(PARAMETER_KEYS.map(k => [k,
  { value: k === "colour" ? `${colour} shell` : "ordinary", category: k === "colour" ? colour : ["wear", "damage", "ageing", "cleanliness"].includes(k) ? "none" : k === "operating_state" ? "off" : "ordinary", certainty: "observed" }])) as Profile["parameters"] });
const lists = () => cleanTaxonomy(Object.fromEntries(TAXONOMY_KEYS.map(key => [key, key === "genre"
  ? [{ name: "Object documentation", definition: "Neutral record of an object.", aliases: ["object documentation photograph", "catalog-product-photo"] }, { name: "snapshot", definition: "Casual photo.", aliases: [] }]
  : key === "colour" ? [{ name: "grey", definition: "Grey body.", aliases: ["light grey"] }, { name: "purple", definition: "Purple body.", aliases: [] }]
  : [{ name: "ordinary", definition: "Ordinary.", aliases: [] }]])));

test("lists are canonical, fixed scales are imposed and reserved names are implicit", () => {
  const keys = lists();
  assert.deepEqual(keys.genre.map(c => c.name), ["object_documentation", "snapshot"]);
  assert.deepEqual(keys.genre[0].aliases, ["object_documentation_photograph", "catalog_product_photo"]);
  assert.deepEqual(keys.wear.map(c => c.name), ["none", "light", "moderate", "heavy"]);
  assert.deepEqual(keys.operating_state.map(c => c.name), ["on", "off", "not_applicable"]);
  assert.throws(() => cleanTaxonomy({ ...keys, colour: [...keys.colour, { name: "Grey", definition: "", aliases: [] }] }), /twice/);
  assert.throws(() => cleanTaxonomy({ ...keys, colour: [{ name: "grey", definition: "", aliases: ["purple"] }, { name: "purple", definition: "", aliases: [] }] }), /already/);
  // A model draft with the same slips is repaired instead of wasting the paid proposal.
  assert.deepEqual(cleanTaxonomy({ ...keys, colour: [...keys.colour, { name: "Grey", definition: "", aliases: ["violet"] }] }, true).colour.map(c => c.name), ["grey", "purple"]);
  assert.deepEqual(cleanTaxonomy({ colour: [{ name: "other", definition: "", aliases: [] }] }).colour, []);
});
test("stored values map through names, aliases and suggestions; the rest waits for classification", () => {
  const keys = lists();
  assert.equal(mapCategory(keys, "genre", "Catalog product photo"), "object_documentation");
  assert.equal(mapCategory(keys, "colour", "light_grey"), "grey");
  assert.equal(mapCategory(keys, "colour", "other", "Purple"), "purple");
  assert.equal(mapCategory(keys, "colour", "other", "teal"), "other");
  assert.equal(mapCategory(keys, "colour", "teal"), null);
  const legacy = profile("object documentation photograph", "teal");
  assert.deepEqual(pendingKeys(legacy, keys), ["colour"]);
  const mapped = applyTaxonomy(legacy, keys);
  assert.equal(mapped.genre, "object_documentation"); assert.equal(mapped.parameters.colour.category, "teal");
  assert.equal(statCategory(mapped, "colour", keys), "pending"); assert.equal(statCategory(mapped, "genre", keys), "object_documentation");
  legacy.parameters.colour.certainty = "unknown";
  assert.deepEqual(pendingKeys(legacy, keys), []); assert.equal(statCategory(legacy, "colour", keys), "unknown");
});
test("closed schemas enumerate the list plus reserved values; aspect ratio stays computed", () => {
  const keys = lists(), schema = profileSchema(keys) as { properties: Record<string, { properties: Record<string, { properties: { category: { enum?: string[] } } }>; enum?: string[] }> };
  assert.deepEqual(schema.properties.genre.enum, ["object_documentation", "snapshot", "other", "unknown"]);
  assert.deepEqual(schema.properties.parameters.properties.wear.properties.category.enum, ["none", "light", "moderate", "heavy", "unknown"]);
  assert.deepEqual(schema.properties.parameters.properties.screen_content.properties.category.enum, ["ordinary", "other", "unknown", "not_applicable"]);
  assert.equal(schema.properties.parameters.properties.aspect_ratio.properties.category.enum, undefined);
  assert.equal((profileSchema(null) as { properties: { genre: { enum?: string[] } } }).properties.genre.enum, undefined);
  const classification = JSON.stringify(classificationSchema(keys, ["i1", "i2"]));
  assert.ok(classification.includes('"enum":["i1","i2"]') && !classification.includes("aspect_ratio"));
});
test("distance and permutation test separate real differences from sampling noise", () => {
  assert.equal(totalVariation({ a: 5, b: 5 }, { a: 10, b: 10, unknown: 40 }), 0);
  assert.equal(totalVariation({ a: 1 }, { b: 1 }), 1);
  assert.equal(compare({ a: 5 }, { a: 5 }).status, "insufficient");
  const same = compare({ a: 30, b: 30, c: 20 }, { a: 31, b: 28, c: 21 });
  assert.equal(same.status, "consistent"); assert.ok(same.p! > .5, String(same.p));
  const shifted = compare({ clean: 60, worn: 40 }, { clean: 95, worn: 5 });
  assert.equal(shifted.status, "divergent"); assert.ok(shifted.p! < .01 && shifted.distance! > .3);
  // Deterministic: the page shows the same p-value on every load.
  assert.equal(compare({ a: 25, b: 15 }, { a: 15, b: 25 }).p, compare({ a: 25, b: 15 }, { a: 15, b: 25 }, 1000, seeded()).p);
  assert.equal(otherShare({ other: 2, grey: 8, unknown: 10 }), .2);
});
