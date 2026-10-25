import assert from "node:assert/strict";
const base = process.env.ROS_TEST_BASE || "http://127.0.0.1:8787";
async function req(path, token, body) {
  const r = await fetch(base + "/api/rooms" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const created = await req("", null, {
  nickname: "Alice",
  count: 2,
  roundSeconds: 10,
});
assert.equal(created.status, 201, JSON.stringify(created));
const { code, token: a } = created.data;
const joined = await req("/" + code + "/join", null, { nickname: "Bob" });
assert.equal(joined.status, 201, JSON.stringify(joined));
const b = joined.data.token;
assert.equal(
  (await req("/" + code + "/join", null, { nickname: "Third" })).status,
  409,
);
assert.equal((await req("/" + code + "/state", "wrong")).status, 401);
const sockets = [];
function socket(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      base.replace("http:", "ws:") + "/api/rooms/" + code + "/ws",
      ["ros", token],
    );
    ws.addEventListener("error", reject, { once: true });
    ws.addEventListener(
      "message",
      (e) => {
        const data = JSON.parse(e.data);
        if (!data.error) resolve(ws);
      },
      { once: true },
    );
    sockets.push(ws);
  });
}
const [wa, wb] = await Promise.all([socket(a), socket(b)]);
const waitMessage = (ws, predicate, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", listen);
      reject(Error("WebSocket state timeout"));
    }, timeout);
    function listen(e) {
      const data = JSON.parse(e.data);
      if (predicate(data)) {
        clearTimeout(timer);
        ws.removeEventListener("message", listen);
        resolve(data);
      }
    }
    ws.addEventListener("message", listen);
  });
const startedMessages = [
  waitMessage(wa, (s) => s.phase === "playing"),
  waitMessage(wb, (s) => s.phase === "playing"),
];
assert.equal(
  (await req("/" + code + "/action", a, { action: "start" })).status,
  200,
);
const [sa, sb] = await Promise.all(startedMessages);
assert.equal(sa.deadline, sb.deadline);
assert.equal(sa.question.image, sb.question.image);
assert.equal(sa.reveal, null);
assert.doesNotMatch(
  JSON.stringify(sa),
  /explanation|ai_prompt|authenticity|licenseUrl|curation|image_medium|perceptual_hash|diagnostics|perceived_plausibility/,
);
const image = await fetch(base + sa.question.image, {
  headers: { Authorization: "Bearer " + a },
});
assert.equal(image.status, 200);
assert.match(image.headers.get("content-type"), /image/);
const firstMedia = await image.text();
assert.equal(await (await fetch(base + sb.question.image, {
  headers: { Authorization: "Bearer " + b },
})).text(), firstMedia);
assert.equal(
  (
    await req("/" + code + "/action", a, {
      action: "answer",
      round: 1,
      choice: "REAL",
    })
  ).status,
  200,
);
assert.equal((await req("/" + code + "/state", a)).data.reveal, null);
assert.equal((await req("/" + code + "/state", b)).data.reveal, null);
assert.equal(
  (
    await req("/" + code + "/action", a, {
      action: "answer",
      round: 1,
      choice: "AI",
    })
  ).status,
  409,
);
const revealed = waitMessage(wa, (s) => s.phase === "reveal");
wb.send(JSON.stringify({ action: "answer", round: 1, choice: "AI" }));
assert.ok((await revealed).reveal.explanation);
assert.equal(
  (await req("/" + code + "/action", a, { action: "next" })).status,
  200,
);
assert.equal(
  (await req("/" + code + "/action", b, { action: "next" })).data.phase,
  "playing",
);
assert.equal(
  (
    await req("/" + code + "/action", a, {
      action: "answer",
      round: 1,
      choice: "REAL",
    })
  ).status,
  409,
);
// Drop and reconnect a real WebSocket, preserving server identity and round.
const beforeReconnect = (await req("/" + code + "/state", a)).data;
const mediaBeforeReconnect = await (await fetch(base + beforeReconnect.question.image, {
  headers: { Authorization: "Bearer " + a },
})).text();
wa.close();
const reconnect = await socket(a);
const state = (await req("/" + code + "/state", a)).data;
assert.equal(state.round, 2);
assert.equal(state.deadline, beforeReconnect.deadline);
assert.equal(await (await fetch(base + state.question.image, {
  headers: { Authorization: "Bearer " + a },
})).text(), mediaBeforeReconnect);
assert.equal(await (await fetch(base + state.question.image, {
  headers: { Authorization: "Bearer " + b },
})).text(), mediaBeforeReconnect);
assert.equal(
  (
    await req("/" + code + "/action", a, {
      action: "answer",
      round: 2,
      choice: "REAL",
    })
  ).status,
  200,
);
// Both receive the same reveal at the common server deadline even if Bob never answers.
const end = await waitMessage(reconnect, (s) => s.phase === "finished", 14000);
assert.deepEqual((await req("/" + code + "/state", b)).data.history, end.history);
assert.equal(end.history.length, 2);
assert.equal(end.total, 2);
assert.equal(
  end.players.reduce((n, p) => n + p.score, 0),
  end.history.flatMap((h) => h.answers).filter((a) => a.correct).length * 100,
);
assert.equal(
  (
    await req("/" + code + "/action", b, {
      action: "answer",
      round: 2,
      choice: "AI",
    })
  ).status,
  410,
);
for (const ws of sockets) ws.close();
console.log(
  "PvP passed: two WebSocket clients, common image/deadline, no early reveal, duplicate/stale rejection, reconnect, alarm timeout and D1 scores.",
);
