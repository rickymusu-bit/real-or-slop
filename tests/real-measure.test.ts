/** Crowding and detail of a REAL (owner decisions of 2026-11-21): the formula, the checks on the model's answer and migrations 0067
 * and 0068. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DETAIL_KINDS, detailText, overThresholds, scores, validObservation, type DetailLevel, type MeasuredObject } from "../shared/real-measure";
import { DEFAULTS } from "../worker/model-context";

/** Levels adding up to `sum` (0 to 14), the 2s first. */
const levels = (sum: number) => Object.fromEntries(DETAIL_KINDS.map((k, i) => [k, Math.max(0, Math.min(2, sum - 2 * i)) as DetailLevel])) as MeasuredObject["detail"];
const object = (name: string, box: [number, number, number, number], sum: number): MeasuredObject =>
  ({ name, box: { x: box[0], y: box[1], width: box[2], height: box[3] }, detail: levels(sum) });

test("crowding counts the objects besides the subject, listed or not, on 100·n/(n+5)", () => {
  const subject = object("Game Boy", [0.3, 0.2, 0.4, 0.6], 4);
  assert.equal(scores({ subject, others: [], unlisted: 0 }).crowdedness, 0);
  const others = (n: number) => Array.from({ length: n }, (_, i) => object("cartuccia " + i, [0, 0, 0.05, 0.05], 0));
  assert.equal(scores({ subject, others: others(5), unlisted: 0 }).crowdedness, 50);
  assert.equal(scores({ subject, others: others(10), unlisted: 0 }).crowdedness, 67);
  assert.equal(scores({ subject, others: others(30), unlisted: 10 }).crowdedness, 89);
});

test("detail is the area-weighted share of graded kinds over the objects' area, not the image's", () => {
  // A subject with every kind dense, alone on an empty background, keeps all of its detail.
  assert.equal(scores({ subject: object("Game Boy", [0.4, 0.4, 0.2, 0.2], 14), others: [], unlisted: 0 }).detail, 100);
  // A console with six kinds legible and none dense is no longer 100 (formula 1 saturated): 6 of 14.
  const legible = { ...Object.fromEntries(DETAIL_KINDS.map(k => [k, 1])), people: 0 } as MeasuredObject["detail"];
  assert.equal(scores({ subject: { name: "console", box: { x: 0, y: 0, width: 1, height: 1 }, detail: legible }, others: [], unlisted: 0 }).detail, 43);
  // Subject 0.2 of area at 14, a plain box 0.2 at 0: half.
  assert.equal(scores({ subject: object("Game Boy", [0, 0, 0.4, 0.5], 14), others: [object("scatola", [0.5, 0, 0.4, 0.5], 0)], unlisted: 0 }).detail, 50);
  // Weights follow the areas, clipped to the image: 0.3·(7/14) + 0.06·(14/14) over 0.36.
  assert.equal(scores({ subject: object("console", [0, 0, 0.6, 0.5], 7), others: [object("cartuccia", [0.7, 0.7, 0.2, 0.5], 14)], unlisted: 0 }).detail, 58);
  // Unlisted objects count for crowding only; a subject with no area falls back to its own share.
  assert.deepEqual(scores({ subject: object("console", [0.5, 0.5, 0, 0], 7), others: [], unlisted: 5 }), { crowdedness: 50, detail: 50 });
});

test("the answer is checked: boxes are clipped to the image, levels are 0, 1 or 2", () => {
  const good = { subject: { name: " Game\u0007Boy ", box: { x: -0.1, y: 0.5, width: 0.5, height: 0.8 }, detail: levels(3) }, others: [], unlisted: 3 };
  assert.deepEqual(validObservation(good), { subject: { name: "Game Boy", box: { x: 0, y: 0.5, width: 0.4, height: 0.5 }, detail: levels(3) }, others: [], unlisted: 3 });
  for (const wrong of [null, {}, { ...good, unlisted: -1 }, { ...good, unlisted: 1.5 }, { ...good, others: "x" },
    { ...good, others: Array(31).fill(good.subject) }, { ...good, subject: { ...good.subject, name: "  " } },
    { ...good, subject: { ...good.subject, box: { x: 0, y: 0, width: -1, height: 1 } } },
    { ...good, subject: { ...good.subject, detail: { ...levels(1), text: true } } },
    { ...good, subject: { ...good.subject, detail: { ...levels(1), people: 3 } } },
    { ...good, subject: { ...good.subject, detail: { text: 1 } } }])
    assert.equal(validObservation(wrong), null, JSON.stringify(wrong));
});

test("the kinds read the same for both formulas", () => {
  assert.equal(detailText({ text: true, repeated: false, texture: true }), "scritte e loghi leggibili, texture dei materiali");
  assert.equal(detailText({ ...levels(0), text: 2, people: 1 }), "scritte e loghi leggibili (fitto), persone e anatomia");
  assert.equal(detailText(levels(0)), "nessun dettaglio leggibile");
});

test("a score equal to its threshold is within it", () => {
  assert.deepEqual(overThresholds({ crowdedness: 67, detail: 100 }, { crowdedness: 67, detail: 100 }), []);
  assert.deepEqual(overThresholds({ crowdedness: 68, detail: 40 }, { crowdedness: 67, detail: 30 }), ["crowdedness", "detail"]);
});

test("migration 0067 adds measures, thresholds, the context part and the settings, keeping every row", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("migrations").sort().filter(file => file < "0067")) db.exec(readFileSync("migrations/" + file, "utf8"));
    db.exec(`INSERT INTO galleries(id,title,slop_instructions) VALUES('g','Console','x');
      INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
        VALUES('real','g','REAL','new','Game Boy','k','${"a".repeat(64)}','image/png',40,50,'now','now');
      INSERT INTO model_contexts(id,part,body,created_at) VALUES('b1','base','Base','2026-11-19T10:00:00.000Z'),('b2','base','Base 2','2026-11-19T10:00:00.000Z');
      INSERT INTO app_settings(key,value,updated_at) VALUES('commons_checks_per_night','20','now'),('open_game_hours','12','now');`);
    const contexts = db.prepare("SELECT id,part,body,created_at,pipeline FROM model_contexts ORDER BY rowid").all().map(r => ({ ...r }));
    const settings = db.prepare("SELECT * FROM app_settings ORDER BY key").all().map(r => ({ ...r }));
    db.exec(readFileSync("migrations/0067_real_measures.sql", "utf8"));
    assert.deepEqual(db.prepare("SELECT id,part,body,created_at,pipeline FROM model_contexts ORDER BY rowid").all().map(r => ({ ...r })), contexts);
    assert.deepEqual(db.prepare("SELECT * FROM app_settings ORDER BY key").all().map(r => ({ ...r })), settings);
    db.exec(`INSERT INTO model_contexts(id,part,body,created_at) VALUES('m','real_measure','Misura','now');
      INSERT INTO app_settings(key,value,updated_at) VALUES('crowdedness_threshold','60','now'),('detail_threshold','100','now');
      UPDATE galleries SET max_crowdedness=50,max_detail=NULL;
      INSERT INTO real_measures(id,image_id,model,base_context,measure_context,observation,crowdedness,detail,created_at)
        VALUES('one','real','m','b2','m','{"subject":{},"others":[],"unlisted":0}',0,50,'now')`);
    assert.throws(() => db.exec("UPDATE galleries SET max_detail=101"));
    assert.throws(() => db.exec("INSERT INTO app_settings(key,value,updated_at) VALUES('other','1','now')"));
    assert.throws(() => db.exec("INSERT INTO real_measures(id,image_id,model,base_context,measure_context,observation,crowdedness,detail,created_at) VALUES('x','real','m','b','m','not json',0,0,'now')"));
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    // A measure goes with its photo.
    db.exec("DELETE FROM images WHERE id='real'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM real_measures").get()?.n, 0);
  } finally { db.close(); }
});

test("migration 0068 marks the earlier measures as formula 1 and updates only the untouched first proposal", () => {
  const run = (current: string | null) => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("PRAGMA foreign_keys=ON");
      for (const file of readdirSync("migrations").sort().filter(file => file < "0068")) db.exec(readFileSync("migrations/" + file, "utf8"));
      db.exec(`INSERT INTO galleries(id,title) VALUES('g','Console');
        INSERT INTO images(id,gallery_id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
          VALUES('real','g','REAL','new','Game Boy','k','${"a".repeat(64)}','image/png',40,50,'now','now');
        INSERT INTO real_measures(id,image_id,model,base_context,measure_context,observation,crowdedness,detail,created_at)
          VALUES('one','real','m','b','m','{}',29,83,'now')`);
      if (current !== null) db.prepare("INSERT INTO model_contexts(id,part,body,created_at) VALUES('m','real_measure',?,'2026-11-21T17:00:00.000Z')").run(current);
      db.exec(readFileSync("migrations/0068_measure_formula_2.sql", "utf8"));
      const formula = db.prepare("SELECT formula,crowdedness,detail FROM real_measures").get();
      const bodies = db.prepare("SELECT body FROM model_contexts WHERE part='real_measure' ORDER BY created_at,rowid").all().map(r => r.body);
      assert.throws(() => db.exec("UPDATE real_measures SET formula=3"));
      return { formula: { ...formula }, bodies };
    } finally { db.close(); }
  };
  // The first proposal of the code, as the migration quotes it.
  const sql = readFileSync("migrations/0068_measure_formula_2.sql", "utf8");
  const first = sql.slice(sql.indexOf("LIMIT 1)='") + 10, sql.lastIndexOf("';")).replaceAll("''", "'");
  assert.ok(first.startsWith("Misuri una fotografia") && first.includes("segna soltanto le categorie leggibili"), first);
  assert.deepEqual(run(first), { formula: { formula: 1, crowdedness: 29, detail: 83 }, bodies: [first, DEFAULTS.real_measure] });
  assert.deepEqual(run("Testo dell'owner").bodies, ["Testo dell'owner"]);
  assert.deepEqual(run(null).bodies, []);
});
