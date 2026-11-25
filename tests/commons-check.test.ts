/** Nightly check of the REAL sources on Commons (worker/commons-check.ts): fifty a night, three months after the last check, a flag
 * only; failures change nothing. D1 is replaced by node:sqlite with the real migrations, Commons by a stubbed fetch. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { checkCommonsSources, dueBefore } from "../worker/commons-check";
import { LIMITS } from "../worker/app-settings";
const CHECKS_PER_NIGHT = LIMITS.commons_checks_per_night.default;
import type { Env } from "../worker/core";

/** The few D1 methods the check uses, on node:sqlite. */
function d1(db: DatabaseSync) {
  const statement = (sql: string, args: SQLInputValue[] = []) => ({
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => {
      db.exec("BEGIN");
      try { const out = []; for (const s of list) out.push(await s.run()); db.exec("COMMIT"); return out; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}
const NOW = Date.parse("2026-11-20T03:17:00.000Z");
const page = (name: string) => "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(name);
function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort()) db.exec(readFileSync("migrations/" + file, "utf8"));
  db.exec("INSERT INTO galleries(id,title) VALUES('g','Strade')");
  let n = 0;
  const add = (id: string, fields: { origin?: string; status?: string; source?: string; checked?: string | null; missing?: string | null }) =>
    db.prepare(`INSERT INTO images(id,gallery_id,origin,status,title,source_url,original_key,original_sha256,original_mime,width,height,
        copy_key,copy_sha256,trashed_from,created_at,updated_at,source_checked_at,source_missing_at)
      VALUES(?,'g',?,?,?,?,?,?,'image/png',40,50,?,?,?,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',?,?)`)
      .run(id, fields.origin || "REAL", fields.status || "published", fields.origin === "SLOP" ? null : id, fields.source ?? page(id + ".jpg"),
        id, (++n).toString(16).padStart(64, "0"), fields.status === "new" ? null : id + "-copy",
        fields.status === "new" ? null : (n + 1000).toString(16).padStart(64, "0"), fields.status === "trash" ? "approved" : null,
        fields.checked === undefined ? "2026-07-01T00:00:00.000Z" : fields.checked, fields.missing ?? null);
  return { db, add, env: { DB: d1(db) } as unknown as Env };
}
const row = (db: DatabaseSync, id: string) =>
  ({ ...db.prepare("SELECT source_url,source_checked_at,source_missing_at,revision FROM images WHERE id=?").get(id) }) as Record<string, string | number | null>;
/** Commons answers like the API with formatversion=2: names starting with «Gone» are missing, «Old» redirects to «New». */
function commons(requests: URL[], fail?: () => Response) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input)); requests.push(url);
    assert.match(String((init?.headers as Record<string, string>)["User-Agent"]), /^RealOrSlop\//);
    if (fail) return fail();
    const titles = url.searchParams.get("titles")!.split("|");
    const redirects = titles.filter(t => t.startsWith("File:Old")).map(t => ({ from: t, to: t.replace("File:Old", "File:New") }));
    const pages = titles.map(t => redirects.find(r => r.from === t)?.to || t)
      .map(t => t.startsWith("File:Gone") ? { title: t, missing: true } : { title: t, pageid: 1 });
    return Response.json({ query: { redirects, pages } });
  }) as typeof fetch;
}

test("a photo is due three calendar months after its last check", () => {
  assert.equal(dueBefore(NOW), "2026-08-20T03:17:00.000Z");
  assert.equal(dueBefore(Date.parse("2026-05-31T00:00:00.000Z")), "2026-03-03T00:00:00.000Z");
});

test("only due REAL with a Commons page, never-checked first, fifty by default, in one request", async () => {
  const { db, add, env } = setup();
  for (let i = 0; i < CHECKS_PER_NIGHT + 5; i++) add("due" + String(i).padStart(2, "0"), { checked: `2026-0${1 + (i % 7)}-01T00:00:00.000Z` });
  add("corrected", { checked: null });
  add("recent", { checked: "2026-10-01T00:00:00.000Z" });
  add("trashed", { status: "trash" });
  add("slop", { origin: "SLOP", source: "" });
  add("elsewhere", { source: "https://example.org/photo.jpg" });
  const requests: URL[] = [];
  commons(requests);
  const result = await checkCommonsSources(env, NOW);
  assert.equal(requests.length, 1);
  const asked = requests[0].searchParams.get("titles")!.split("|");
  assert.equal(asked.length, CHECKS_PER_NIGHT);
  assert.ok(asked.includes("File:corrected.jpg"), "a corrected address comes first");
  for (const id of ["recent", "trashed", "slop", "elsewhere"]) assert.ok(!asked.includes(`File:${id}.jpg`), id);
  assert.equal(requests[0].searchParams.get("redirects"), "1");
  assert.equal(requests[0].searchParams.get("maxlag"), "5");
  assert.deepEqual(result, { checked: 50, found: 50, missing: 0, moved: 0 });
  const left = db.prepare("SELECT count(*) AS n FROM images WHERE id LIKE 'due%' AND source_checked_at<=?").get(dueBefore(NOW))!.n;
  assert.equal(left, 6, "the corrected address took one place: six left for the next night");
  assert.equal(row(db, "recent").source_checked_at, "2026-10-01T00:00:00.000Z");
});

test("a missing file is flagged and keeps its first date; a moved file follows the redirect; a found file clears the flag", async () => {
  const { db, add, env } = setup();
  add("Gone", {});
  add("Gone-again", { missing: "2026-05-01T00:00:00.000Z" });
  add("Old", {});
  add("Back", { missing: "2026-05-01T00:00:00.000Z" });
  add("broken", { source: "https://commons.wikimedia.org/wiki/File:" });
  const before = row(db, "Old").revision as number;
  commons([]);
  assert.deepEqual(await checkCommonsSources(env, NOW), { checked: 4, found: 2, missing: 2, moved: 1 });
  const stamp = new Date(NOW).toISOString();
  assert.deepEqual(row(db, "Gone"), { source_url: page("Gone.jpg"), source_checked_at: stamp, source_missing_at: stamp, revision: 0 });
  assert.equal(row(db, "Gone-again").source_missing_at, "2026-05-01T00:00:00.000Z");
  assert.equal(row(db, "Old").source_url, "https://commons.wikimedia.org/wiki/File:New.jpg");
  assert.equal(row(db, "Old").revision, before + 1);
  assert.equal(row(db, "Back").source_missing_at, null);
  // An address that is no Commons file any more is set aside for three months, unflagged.
  assert.deepEqual([row(db, "broken").source_checked_at, row(db, "broken").source_missing_at], [stamp, null]);
  // Nothing is withdrawn or deleted: a flag only.
  assert.equal(db.prepare("SELECT count(*) AS n FROM images WHERE status='published'").get()!.n, 5);
});

test("a failure of Commons changes nothing and the same photos come back the next night", async () => {
  for (const fail of [() => new Response("busy", { status: 503 }), () => Response.json({ error: { code: "maxlag" } }),
    () => { throw new TypeError("network"); }]) {
    const { db, add, env } = setup();
    add("Gone", {});
    const result = await (commons([], fail), checkCommonsSources(env, NOW));
    assert.equal(result.checked, 0);
    assert.ok(result.skipped, JSON.stringify(result));
    assert.deepEqual([row(db, "Gone").source_checked_at, row(db, "Gone").source_missing_at], ["2026-07-01T00:00:00.000Z", null]);
  }
});

test("the migration counts the acquisition as the first check of every Commons REAL", () => {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort().filter(f => f < "0065")) db.exec(readFileSync("migrations/" + file, "utf8"));
  db.exec(`INSERT INTO galleries(id,title) VALUES('g','Strade');
    INSERT INTO images(id,gallery_id,origin,title,source_url,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
    VALUES('commons','g','REAL','A','${page("A.jpg")}','a','${"a".repeat(64)}','image/png',4,5,'2026-02-02T00:00:00.000Z','x'),
          ('uploaded','g','REAL','B','','b','${"b".repeat(64)}','image/png',4,5,'2026-02-02T00:00:00.000Z','x'),
          ('slop','g','SLOP',NULL,'','c','${"c".repeat(64)}','image/png',4,5,'2026-02-02T00:00:00.000Z','x');
    INSERT INTO app_settings(key,value,updated_at) VALUES('open_game_hours','30','t'),('editorial_tolerance','2','t')`);
  db.exec(readFileSync("migrations/0065_commons_source_check.sql", "utf8"));
  // The settings keep every row and accept the new key.
  assert.deepEqual(db.prepare("SELECT key,value,updated_at FROM app_settings ORDER BY key").all().map(r => ({ ...r })),
    [{ key: "editorial_tolerance", value: "2", updated_at: "t" }, { key: "open_game_hours", value: "30", updated_at: "t" }]);
  db.exec("INSERT INTO app_settings(key,value,updated_at) VALUES('commons_checks_per_night','120','t')");
  assert.throws(() => db.exec("INSERT INTO app_settings(key,value,updated_at) VALUES('other','1','t')"));
  assert.deepEqual(db.prepare("SELECT id,source_checked_at,source_missing_at FROM images ORDER BY id").all().map(r => ({ ...r })), [
    { id: "commons", source_checked_at: "2026-02-02T00:00:00.000Z", source_missing_at: null },
    { id: "slop", source_checked_at: null, source_missing_at: null },
    { id: "uploaded", source_checked_at: null, source_missing_at: null },
  ]);
});

test("the number per night comes from the Settings: 0 pauses, more than 50 makes requests of 50 one after the other", async () => {
  assert.deepEqual(LIMITS.commons_checks_per_night, { min: 0, max: 500, default: 50 });
  const { db, add, env } = setup();
  for (let i = 0; i < 130; i++) add("due" + String(i).padStart(3, "0"), {});
  const setting = (n: number) => db.prepare("INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('commons_checks_per_night',?,'now')").run(String(n));
  setting(0);
  const none: URL[] = [];
  commons(none);
  assert.equal((await checkCommonsSources(env, NOW)).skipped, "Checks paused in Settings");
  assert.equal(none.length, 0);
  setting(120);
  const requests: URL[] = [];
  commons(requests);
  assert.equal((await checkCommonsSources(env, NOW)).checked, 120);
  assert.deepEqual(requests.map(r => r.searchParams.get("titles")!.split("|").length), [50, 50, 20]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM images WHERE source_checked_at=?").get(new Date(NOW).toISOString())!.n, 120);
  // A value outside the limits stored by hand counts as the default.
  setting(9999);
  const later = Date.parse("2027-03-01T00:00:00.000Z"), again: URL[] = [];
  commons(again);
  assert.equal((await checkCommonsSources(env, later)).checked, 50);
});

test("a failure in a later request keeps what the earlier ones answered and leaves the rest due", async () => {
  const { db, add, env } = setup();
  for (let i = 0; i < 80; i++) add("due" + String(i).padStart(3, "0"), {});
  const requests: URL[] = [];
  let calls = 0;
  commons(requests, () => ++calls === 1 ? Response.json({ query: { pages: requests[0].searchParams.get("titles")!.split("|").map(title => ({ title, pageid: 1 })) } })
    : new Response("busy", { status: 503 }));
  const result = await checkCommonsSources(env, NOW, 80);
  assert.deepEqual(result, { checked: 50, found: 50, missing: 0, moved: 0, skipped: "Commons HTTP 503" });
  assert.equal(db.prepare("SELECT count(*) AS n FROM images WHERE source_checked_at=?").get(new Date(NOW).toISOString())!.n, 50);
});
