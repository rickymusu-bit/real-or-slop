/** Game copy recipe: nearest common format, crops, dimensions, generator sizes per model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMATS, GAME_COPY_RECIPE, GENERATION_SIZES, centredCrop, centredView, copyDimensions, cropError, formatsFor, generationSize,
  nearestFormat, parseCrop, parseView, storedCrop, viewError, viewFractions, viewWidth,
} from "../shared/game-copy.ts";

test("the nearest format follows the proportions of the photo", () => {
  assert.equal(nearestFormat(6000, 4000), "3:2");
  assert.equal(nearestFormat(4032, 3024), "4:3");
  assert.equal(nearestFormat(1920, 1080), "16:9");
  assert.equal(nearestFormat(3000, 1000), "16:9");   // panoramas go to the widest format
  assert.equal(nearestFormat(1000, 1000), "1:1");
  assert.equal(nearestFormat(1024, 1280), "3:4");    // the 4:5 SLOP of the previous recipe
  assert.equal(nearestFormat(1024, 1536), "2:3");
  assert.equal(nearestFormat(1080, 1920), "9:16");
  assert.equal(nearestFormat(1000, 1140), "1:1");    // closer to the square than to 3:4
});

test("the centred crop is the largest frame of the format, valid for any image", () => {
  assert.deepEqual(centredCrop(6000, 4000), { x: 1400, y: 0, width: 3200, height: 4000, format: "4:5" });
  assert.deepEqual(centredCrop(4000, 3200), { x: 720, y: 0, width: 2560, height: 3200, format: "4:5" });
  assert.deepEqual(centredCrop(1024, 1280), { x: 0, y: 0, width: 1024, height: 1280, format: "4:5" });
  assert.deepEqual(centredCrop(6000, 4000, "1:1"), { x: 1000, y: 0, width: 4000, height: 4000, format: "1:1" });
  for (const [w, h] of [[6000, 4000], [999, 1001], [64, 2000], [2000, 64], [4032, 3024], [1080, 1920]]) {
    for (const format of FORMATS) assert.equal(cropError(w, h, centredCrop(w, h, format)), "", `${w}×${h} ${format}`);
  }
  assert.equal(cropError(1, 1, centredCrop(1, 1)), "");
  assert.throws(() => centredCrop(1, 1, "3:2"));
  assert.throws(() => centredCrop(0, 10));
});

test("a crop outside the image, of the wrong shape or format is refused", () => {
  assert.equal(cropError(6000, 4000, { x: 1, y: 0, width: 6000, height: 4000, format: "3:2" }), "Inquadratura fuori dall'immagine");
  assert.equal(cropError(6000, 4000, { x: 0, y: 0, width: 5000, height: 4000, format: "3:2" }), "Inquadratura non nel formato 3:2");
  assert.equal(cropError(6000, 4000, { x: 0, y: 0, width: 3200, height: 4000, format: "4:5" }), "");
  assert.equal(cropError(6000, 4000, { x: 0, y: 0, width: 30, height: 20, format: "3:2" }), "Inquadratura troppo piccola o fuori dall'immagine");
  assert.equal(cropError(6000, 4000, { x: 0, y: 0, height: 4000 }), "Formato non previsto");   // a 4:5 crop of v2
  assert.equal(cropError(6000, 4000, null), "Inquadratura mancante");
});

test("copies keep the format and have a long side of at most 1536 px, never enlarged", () => {
  assert.deepEqual(copyDimensions({ width: 6000, height: 4000, format: "3:2" }), { width: 1536, height: 1024 });
  assert.deepEqual(copyDimensions({ width: 3000, height: 4000, format: "3:4" }), { width: 1152, height: 1536 });
  assert.deepEqual(copyDimensions({ width: 1920, height: 1080, format: "16:9" }), { width: 1536, height: 864 });
  assert.deepEqual(copyDimensions({ width: 800, height: 600, format: "4:3" }), { width: 800, height: 600 });
  assert.deepEqual(copyDimensions({ width: 960, height: 1280, format: "3:4" }), { width: 960, height: 1280 });
  assert.match(GAME_COPY_RECIPE, /max1536/);
});

test("the initial view is the largest centred 4:5 frame, inside the copy", () => {
  assert.deepEqual(centredView(1536, 1024), { x: 358, y: 0, height: 1024 });
  assert.equal(viewWidth(1024), 819);
  assert.deepEqual(centredView(864, 1536), { x: 0, y: 228, height: 1080 });
  for (const [w, h] of [[1536, 1024], [864, 1536], [1536, 1536], [5, 5], [1, 1]]) assert.equal(viewError(w, h, centredView(w, h)), "", `${w}×${h}`);
  assert.equal(viewError(1536, 1024, { x: 800, y: 0, height: 1024 }), "Vista iniziale fuori dalla copia");
  assert.equal(viewError(1536, 1024, { x: 0, y: 0, height: 10 }), "Vista iniziale troppo piccola o fuori dalla copia");
  assert.deepEqual(viewFractions(null, 1536, 1024), { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(viewFractions({ x: 358, y: 0, height: 1024 }, 1536, 1024), { x: 0.2331, y: 0, width: 0.5332, height: 1 });
});

test("query forms and stored values", () => {
  assert.deepEqual(parseCrop("0,0,6000,4000,3:2"), { x: 0, y: 0, width: 6000, height: 4000, format: "3:2" });
  assert.deepEqual(parseCrop("0,0,3200,4000,4:5"), {x:0,y:0,width:3200,height:4000,format:"4:5"});
  assert.equal(parseCrop("0,0,4000"), null);
  assert.deepEqual(parseView("358,0,1024"), { x: 358, y: 0, height: 1024 });
  assert.equal(parseView("-1,0,1024"), null);
  assert.equal(storedCrop(JSON.stringify({ x: 0, y: 0, height: 4000 })), null);   // 4:5 copy to be made again
  assert.equal(storedCrop(JSON.stringify({ x: 0, y: 0, width: 6, height: 4, format: "3:2" })), null);
  assert.deepEqual(storedCrop(JSON.stringify({x:0,y:0,width:80,height:100,format:"4:5"})), {x:0,y:0,width:80,height:100,format:"4:5"});
});

test("generator sizes respect the documented limits; standard-only models get three formats", () => {
  for (const size of Object.values(GENERATION_SIZES)) {
    const [w, h] = size.split("x").map(Number);
    assert.ok(w % 16 === 0 && h % 16 === 0 && w * h >= 655_360 && w * h <= 8_294_400 && Math.max(w, h) / Math.min(w, h) <= 3, size);
  }
  assert.equal(generationSize("gpt-image-2.5-flare", "4:3"), "1536x1152");
  assert.equal(generationSize("gpt-image-2", "9:16"), "864x1536");
  assert.equal(generationSize("gpt-image-1.5", "16:9"), "1536x1024");
  assert.equal(generationSize("gpt-image-1.5", "3:4"), "1024x1536");
  assert.equal(generationSize("chatgpt-image-latest", "1:1"), "1024x1024");
  assert.deepEqual(formatsFor("gpt-image-1-mini"), ["3:2", "2:3", "1:1"]);
  assert.equal(formatsFor("gpt-image-2.6-sunburst").length, 7);
});
