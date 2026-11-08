import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeLotTitle } from "../shared/editorial-lots.v1.0.0.ts";

test("lot title proposal prefers the category shared by most selected files", () => {
  assert.equal(proposeLotTitle([{ categories: ["Canals of Venice", "Gondolas"] }, { categories: ["Canals of Venice"] },
    { categories: ["Gondolas", "Gondolas"] }], "venice"), "Canals of Venice");
  assert.equal(proposeLotTitle([{ categories: [] }], "Category:Protests_in_Paris"), "Protests in Paris");
  assert.equal(proposeLotTitle([{ categories: [] }], "rain"), "");
  assert.equal(proposeLotTitle([], "x".repeat(300)).length, 200);
});
