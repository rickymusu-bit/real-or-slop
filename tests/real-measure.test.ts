/** Crowding and detail of a REAL (owner decisions of 2026-11-21): the formula, the checks on the model's answer and migration 0067. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DETAIL_KINDS, overThresholds, scores, validObservation, type MeasuredObject } from "../shared/real-measure";

const kinds = (n: number) => Object.fromEntries(DETAIL_KINDS.map((k, i) => [k, i < n])) as MeasuredObject["detail"];
const object = (name: string, box: [number, number, number, number], n: number): MeasuredObject =>
  ({ name, box: { x: box[0], y: box[1], width: box[2], height: box[3] }, detail: kinds(n) });

test("crowding counts the objects besides the subject, listed or not, on 100·n/(n+5)", () => {
  const subject = object("Game Boy", [0.3, 0.2, 0.4, 0.6], 4);
  assert.equal(scores({ subject, others: [], unlisted: 0 }).crowdedness, 0);
  const others = (n: number) => Array.from({ length: n }, (_, i) => object("cartuccia " + i, [0, 0, 0.05, 0.05], 0));
  assert.equal(scores({ subject, others: others(5), unlisted: 0 }).crowdedness, 50);
  assert.equal(scores({ subject, others: others(10), unlisted: 0 }).crowdedness, 67);
  assert.equal(scores({ subject, others: others(30), unlisted: 10 }).crowdedness, 89);
});

test("detail is the area-weighted share of kinds over the objects' area, not the image's", () => {
  // A detailed subject alone on an empty background keeps all of its detail.
  assert.equal(scores({ subject: object("Game Boy", [0.4, 0.4, 0.2, 0.2], 6), others: [], unlisted: 0 }).detail, 100);
  // Subject 0.2 of area with 6/6, a plain box 0.2 with 0/6: half.
  assert.equal(scores({ subject: object("Game Boy", [0, 0, 0.4, 0.5], 6), others: [object("scatola", [0.5, 0, 0.4, 0.5], 0)], unlisted: 0 }).detail, 50);
  // Weights follow the areas, clipped to the image: 0.3·(3/6) + 0.06·(6/6) over 0.36.
  assert.equal(scores({ subject: object("console", [0, 0, 0.6, 0.5], 3), others: [object("cartuccia", [0.7, 0.7, 0.2, 0.5], 6)], unlisted: 0 }).detail, 58);
  // Unlisted objects count for crowding only; a subject with no area falls back to its own share.
  assert.deepEqual(scores({ subject: object("console", [0.5, 0.5, 0, 0], 3), others: [], unlisted: 5 }), { crowdedness: 50, detail: 50 });
});

test("the answer is checked: boxes are clipped to the image, wrong shapes are refused", () => {
  const good = { subject: { name: " Game\u0007Boy ", box: { x: -0.1, y: 0.5, width: 0.5, height: 0.8 }, detail: kinds(2) }, others: [], unlisted: 3 };
  assert.deepEqual(validObservation(good), { subject: { name: "Game Boy", box: { x: 0, y: 0.5, width: 0.4, height: 0.5 }, detail: kinds(2) }, others: [], unlisted: 3 });
  for (const wrong of [null, {}, { ...good, unlisted: -1 }, { ...good, unlisted: 1.5 }, { ...good, others: "x" },
    { ...good, others: Array(31).fill(good.subject) }, { ...good, subject: { ...good.subject, name: "  " } },
    { ...good, subject: { ...good.subject, box: { x: 0, y: 0, width: -1, height: 1 } } },
    { ...good, subject: { ...good.subject, detail: { ...kinds(1), text: "yes" } } }])
    assert.equal(validObservation(wrong), null, JSON.stringify(wrong));
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
