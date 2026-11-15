/** The request body with an image: valid JSON, a data URL identical to the standard base64 of the bytes, one placeholder only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { IMAGE_MARK, jsonWithImage } from "../worker/image-body";

test("the image goes into the JSON body as standard base64, for every length", () => {
  for (const length of [0, 1, 2, 3, 4, 5, 1000, 65_537]) {
    const bytes = new Uint8Array(length).map((_, i) => (i * 37 + length) & 255);
    const body = jsonWithImage({ model: "m", text: "àè «x»", input: [{ type: "input_image", image_url: IMAGE_MARK }] }, bytes, "image/jpeg");
    const parsed = JSON.parse(new TextDecoder().decode(body));
    assert.equal(parsed.text, "àè «x»");
    assert.equal(parsed.input[0].image_url, "data:image/jpeg;base64," + Buffer.from(bytes).toString("base64"));
  }
});

test("the placeholder must appear exactly once", () => {
  assert.throws(() => jsonWithImage({ a: 1 }, new Uint8Array(3), "image/png"));
  assert.throws(() => jsonWithImage({ a: IMAGE_MARK, b: IMAGE_MARK }, new Uint8Array(3), "image/png"));
});
