/** v1.0.0, 2026-11-12T09:00:00Z: levels, score, nickname and game code (docs/gioco-a-livelli.v1.0.0.md). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE_ALPHABET, formatCode, isCode, LEVELS, nicknameError, normaliseCode, scoreOf, type Outcome } from "../shared/levels.v1.0.0.ts";

const games = (pairs: [Outcome["answer"], Outcome["choice"]][]) => pairs.map(([answer, choice]) => ({ answer, choice }));

test("four levels fixed in the code", () => {
  assert.deepEqual(Object.values(LEVELS).map(l => [l.photos, l.seconds]), [[10, 20], [15, 15], [20, 10], [25, 5]]);
});

test("score = photos × (2 × balanced accuracy − 1)", () => {
  const perfect = scoreOf(games([["REAL", "REAL"], ["AI", "AI"], ["REAL", "REAL"], ["AI", "AI"]]));
  assert.equal(perfect.score, 4); assert.equal(perfect.balanced_accuracy, 1);
  // Always «REAL»: right on every REAL, wrong on every SLOP, zero whatever the mix.
  assert.equal(scoreOf(games([["REAL", "REAL"], ["REAL", "REAL"], ["REAL", "REAL"], ["AI", "REAL"]])).score, 0);
  // All wrong: −photos.
  assert.equal(scoreOf(games([["REAL", "AI"], ["AI", "REAL"]])).score, -2);
  // A timed-out photo counts as not recognised.
  const late = scoreOf(games([["REAL", null], ["REAL", "REAL"], ["AI", "AI"], ["AI", "AI"]]));
  assert.deepEqual([late.balanced_accuracy, late.score, late.timed_out], [0.75, 2, 1]);
  assert.deepEqual(late.real, { right: 1, total: 2 });
  // Only one origin in the game: plain accuracy.
  assert.equal(scoreOf(games([["AI", "AI"], ["AI", "AI"], ["AI", "REAL"], ["AI", "AI"]])).score, 2);
  assert.equal(scoreOf([]).score, 0);
});

test("nicknames: length, characters, indecent words also disguised, no false alarms on ordinary names", () => {
  for (const ok of ["Annalisa", "Figaro", "Nazionale Roma", "Mario_88", "Dickens fan", "Essex", "Gioia.R", "Zoë"])
    assert.equal(nicknameError(ok), "", ok);
  for (const bad of ["m3rda", "M.E.R.D.A", "cazzzone", "stronzo_99", "FUCK you", "sh1t", "la troia", "nazi", "Duce", "admin", "porco dio"])
    assert.match(nicknameError(bad), /non ammesso/, bad);
  assert.match(nicknameError("ab"), /da 3 a 20/);
  assert.match(nicknameError("x".repeat(21)), /da 3 a 20/);
  assert.match(nicknameError("<script>"), /Usa solo/);
  assert.match(nicknameError(42), /mancante/);
});

test("game codes: ten characters without look-alikes", () => {
  assert.equal(CODE_ALPHABET.includes("0") || CODE_ALPHABET.includes("O") || CODE_ALPHABET.includes("I") || CODE_ALPHABET.includes("1"), false);
  assert.equal(formatCode("ABCDEFGHJK"), "ABCD-EFGH-JK");
  assert.equal(normaliseCode("abcd-efgh jk"), "ABCDEFGHJK");
  assert.equal(isCode("abcd-efgh-jk"), true);
  assert.equal(isCode("ABCD-EFGH-J0"), false);
});
