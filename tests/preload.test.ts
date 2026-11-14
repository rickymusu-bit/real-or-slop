import { test } from "node:test";
import assert from "node:assert/strict";
import { ImagePreloader, type DecodedImage } from "../src/preload.ts";
const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function asset(url = "blob:fixture", width = 10, height = 10, release = () => {}) { return { url, width, height, release }; }

test("preload deduplicates concurrent fetch/decode and only resolves after decode", async () => {
  let fetches = 0, decodes = 0, resolveDecode!: (value: DecodedImage) => void;
  const manager = new ImagePreloader({ fetcher: async () => { fetches++; return new Blob(["fixture"]); }, decoder: async () => { decodes++; return new Promise(resolve => { resolveDecode = resolve; }); } });
  let ready = false;
  const first = manager.activate("/opaque/one").then(value => { ready = true; return value; });
  const second = manager.activate("/opaque/one");
  await wait(); assert.equal(ready, false); assert.equal(fetches, 1); assert.equal(decodes, 1);
  resolveDecode(asset());
  assert.equal(await first, await second); assert.equal(ready, true);
  await manager.activate("/opaque/one"); assert.equal(fetches, 1); assert.equal(decodes, 1); manager.dispose();
});
test("queue bounds concurrency and prioritizes the active image over queued future images", async () => {
  const started: string[] = [], resolveFetch = new Map<string, () => void>();
  const manager = new ImagePreloader({ concurrency: 2, fetcher: async url => { started.push(url); await new Promise<void>(resolve => resolveFetch.set(url, resolve)); return new Blob(["f"]); }, decoder: async () => asset() });
  const one = manager.prefetch("one"), two = manager.prefetch("two"), three = manager.prefetch("three");
  const active = manager.activate("active");
  assert.deepEqual(started, ["one", "two"]); assert.equal(manager.metrics.inFlight, 2);
  resolveFetch.get("one")!(); await wait(); assert.deepEqual(started, ["one", "two", "active"]);
  resolveFetch.get("active")!(); await active; await wait(); assert.equal(started[3], "three");
  resolveFetch.get("two")!(); resolveFetch.get("three")!(); await Promise.all([one, two, three]); manager.dispose();
});
test("all 50 files can be verified while retaining only a bounded decoded window", async () => {
  let fetched = 0, released = 0;
  const manager = new ImagePreloader({ decodedBytes: 1200, fetcher: async () => { fetched++; return new Blob(["data"]); }, decoder: async () => asset("blob:" + fetched, 10, 10, () => released++) });
  const urls = Array.from({ length: 50 }, (_, i) => "neutral/" + i);
  manager.retain(urls.slice(0, 3));
  let count = 0;
  await manager.prepareAll([...urls, urls[0]], value => { count = value.verified; assert.ok(manager.metrics.decodedBytes <= 1200); });
  assert.equal(count, 50); assert.equal(fetched, 50); assert.equal(manager.metrics.encodedBytes, 200); assert.ok(released >= 47);
  manager.retain(urls.slice(20, 23)); await manager.activate(urls[20]); assert.equal(fetched, 50); // decode cached bytes, no network
  assert.ok(manager.metrics.decodedBytes <= 1200);
  manager.dispose(); assert.equal(manager.metrics.decodedBytes, 0); assert.equal(manager.metrics.encodedBytes, 0);
});
test("training windows release old compressed bytes without releasing the displayed image early", async () => {
  const released: string[] = [];
  let n = 0;
  const manager = new ImagePreloader({ fetcher: async () => new Blob(["data"]), decoder: async () => { const url = "blob:" + n++; return asset(url, 10, 10, () => released.push(url)); } });
  manager.retain(["one", "two"], false);
  const one = await manager.activate("one"); await manager.prefetch("two");
  manager.retain(["two", "three"], false); assert.ok(!released.includes(one.url));
  await manager.activate("two"); assert.ok(released.includes(one.url)); assert.equal(manager.metrics.encodedBytes, 4); manager.dispose();
});
test("download/decode/empty/dimension errors fail closed and a retry performs a new fetch", async () => {
  for (const kind of ["download", "decode", "empty", "pixels"]) {
    let attempts = 0;
    const manager = new ImagePreloader({ fetcher: async () => { attempts++; if (attempts === 1 && kind === "download") throw Error("offline"); return new Blob([attempts === 1 && kind === "empty" ? "" : "data"]); }, decoder: async () => { if (attempts === 1 && kind === "decode") throw Error("corrupt"); return asset("blob:x", attempts === 1 && kind === "pixels" ? 0 : 10); } });
    await assert.rejects(manager.activate("one")); assert.equal(manager.metrics.encodedBytes, 0);
    await manager.activate("one"); assert.equal(attempts, 2); manager.dispose();
  }
});
test("byte and decoded-memory budgets reject oversized assets before play", async () => {
  for (const options of [{ assetBytes: 2 }, { encodedBytes: 2 }, { decodedBytes: 2 }, { pixels: 2 }]) {
    const manager = new ImagePreloader({ ...options, fetcher: async () => new Blob(["data"]), decoder: async () => asset() });
    await assert.rejects(manager.activate("one")); assert.equal(manager.metrics.encodedBytes, 0); assert.equal(manager.metrics.decodedBytes, 0); manager.dispose();
  }
});
test("timeout aborts a stuck operation; disposal rejects queued work and cancels in-flight work", async () => {
  let aborted = 0;
  const manager = new ImagePreloader({ concurrency: 1, timeoutMs: 15, fetcher: async (_, signal) => { signal.addEventListener("abort", () => aborted++); return new Promise(() => {}); } });
  await assert.rejects(manager.activate("one"), /lento/); assert.equal(aborted, 1);
  const first = assert.rejects(manager.activate("two")), queued = assert.rejects(manager.prefetch("three"));
  manager.dispose(); await Promise.all([first, queued]); assert.equal(manager.metrics.encodedBytes, 0);
});
test("changing the active round cannot resolve a previous image as the current one", async () => {
  const released: string[] = [];
  const manager = new ImagePreloader({ fetcher: async () => { await wait(); return new Blob(["x"]); }, decoder: async () => asset("blob:x", 10, 10, () => released.push("x")) });
  const stale = assert.rejects(manager.activate("one")); const current = manager.activate("two");
  await stale; await current; manager.dispose(); assert.equal(released.length, 2);
});
