import { test } from "node:test";
import assert from "node:assert/strict";
import { GameRoom } from "../worker/room.ts";
import { mediaProtocol } from "../shared/preloading.ts";
import { hash, type Env } from "../worker/core.ts";
async function fixture(legacy = false, rollout?: string) {
  let now = 10_000;
  const logs: { sql: string; values: unknown[] }[] = [];
  const room = {
    code: "ABCDEFGHJKLM", challengeId: "fixture", protocolVersion: legacy ? undefined : 2,
    phase: legacy ? "playing" : "preparing", round: 0, roundSeconds: 20,
    deadline: legacy ? 30_000 : 0, startedAt: legacy ? 10_000 : 0,
    createdAt: 0, expiresAt: 1_000_000, preparationDeadline: 55_000, mediaKey: "opaque",
    players: await Promise.all(["one", "two"].map(async (token, i) => ({ id: token, tokenHash: await hash(token), nickname: "Player " + i, score: 0, elapsedMs: 0, answer: null, ready: false, mediaReady: false, left: false, window: now, requests: 0 }))),
    images: [{ id: "private-id", type: "REAL", title: "PRIVATE", explanation: "PRIVATE", r2_key: "fixture", demo: 1 }], warnings: [], history: [],
  };
  let stored = structuredClone(room), alarm: number | null = null, serial: Promise<unknown> = Promise.resolve();
  const ctx = {
    blockConcurrencyWhile<T>(fn: () => Promise<T>) { const next = serial.then(fn); serial = next.catch(() => {}); return next; },
    storage: { async get() { return structuredClone(stored); }, async put(_: string, value: typeof room) { stored = structuredClone(value); }, async setAlarm(value: number) { alarm = value; }, async deleteAlarm() { alarm = null; } },
    getWebSockets: () => [],
  };
  const env = { DATA_MODE: "demo", PRELOAD_PROTOCOL: rollout, DB: { prepare(sql: string) { return { bind(...values: unknown[]) { logs.push({ sql, values }); return { async run() { return { meta: { changes: 1 } }; } }; } }; }, async batch() { return []; } } };
  const actor = new GameRoom(ctx as unknown as DurableObjectState, env as unknown as Env, () => now);
  async function req(token: string, data?: Record<string, unknown>) {
    const r = await actor.fetch(new Request("https://local.test/" + (data ? "action" : "state"), { method: data ? "POST" : "GET", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined }));
    return { status: r.status, data: await r.json() as Record<string, unknown> };
  }
  return { req, actor, logs, saved: () => stored, alarm: () => alarm, advance: (ms: number) => { now += ms; } };
}
test("PvP starts only after both clients are ready, and concurrent/retried readiness cannot extend time", async () => {
  const f = await fixture();
  assert.equal((await f.req("one", { action: "answer", round: 1, choice: "REAL" })).status, 410);
  const first = await f.req("one", { action: "media-ready", round: 1 });
  assert.equal(first.data.phase, "preparing"); assert.equal(first.data.deadline, 0);
  assert.equal(f.saved().players[0].score, 0);
  f.advance(3000);
  const results = await Promise.all([f.req("two", { action: "media-ready", round: 1 }), f.req("two", { action: "media-ready", round: 1 })]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(results[0].data.deadline, 33_000); assert.equal(results[1].data.deadline, 33_000);
  f.advance(5000); assert.equal((await f.req("one", { action: "media-ready", round: 1 })).data.deadline, 33_000);
  assert.equal(f.alarm(), 33_000); assert.deepEqual((await f.req("one")).data.question, (await f.req("two")).data.question);
  assert.doesNotMatch(JSON.stringify((await f.req("one")).data), /PRIVATE|private-id|explanation|type/);
});
test("an absent PvP client causes bounded preparation invalidation without a timeout score", async () => {
  const f = await fixture(); await f.req("one", { action: "media-ready", round: 1 });
  f.advance(45_001); await f.actor.alarm();
  const view = await f.req("two");
  assert.equal(view.data.phase, "invalidated"); assert.equal(view.data.invalidReason, "preparation_timeout"); assert.equal(view.data.question, null);
  assert.equal(f.alarm(), null); assert.ok(f.saved().players.every(p => p.score === 0 && p.elapsedMs === 0));
  assert.ok(f.logs.some(log => log.sql.includes("UPDATE challenges") && log.values[0] === "invalidated"));
  assert.equal((await f.req("two", { action: "media-ready", round: 1 })).status, 410);
});
test("stale readiness, failure and next packets cannot change a different round", async () => {
  const f = await fixture();
  for (const action of ["media-ready", "media-failed", "next"]) assert.equal((await f.req("one", { action, round: 2 })).status, 409);
  assert.equal((await f.req("one")).data.phase, "preparing");
  assert.equal((await f.req("one", { action: "media-failed", round: 1 })).data.phase, "invalidated");
  assert.equal((await f.req("one", { action: "leave" })).data.phase, "invalidated");
  assert.ok(!f.logs.some(log => log.sql.includes("UPDATE challenges") && log.values[0] === "abandoned"));
});
test("legacy PvP snapshots retain their already active deadline without a preparation reset", async () => {
  const f = await fixture(true); f.advance(5000);
  assert.equal((await f.req("one")).data.deadline, 30_000);
  assert.equal((await f.req("one")).data.protocolVersion, 1);
  assert.equal((await f.req("one", { action: "media-ready", round: 1 })).status, 409);
  assert.equal((await f.req("one")).data.deadline, 30_000);
});

test("rollback selection is explicit and never changes an already assigned protocol", async () => {
  assert.equal(mediaProtocol(), 2); assert.equal(mediaProtocol("legacy"), 1); assert.equal(mediaProtocol("unexpected"), 2);
  const f = await fixture(false, "legacy");
  assert.equal((await f.req("one")).data.protocolVersion, 2);
  assert.equal((await f.req("one", { action: "media-ready", round: 1 })).data.phase, "preparing");
  assert.equal((await f.req("two", { action: "media-ready", round: 1 })).data.phase, "playing");
});
