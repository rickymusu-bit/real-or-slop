import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {proposal, spreadPercent, type AutoInput} from '../shared/slop-proposals';
const input = (over: Partial<AutoInput> = {}): AutoInput => ({real:60, slop:0, pending:0, available:60, enabled:true, openBatch:false, ignoredMissing:null, ...over});
test('balance counts independent SLOP, including pending images before requesting more', () => {
  assert.equal(spreadPercent(0,0),null);
  assert.equal(proposal(input()).proposal?.size,10);
  assert.equal(proposal(input({slop:40})).proposal?.size,10);
  assert.equal(proposal(input({slop:59})).proposal?.size,1);
  assert.equal(proposal(input({slop:30,pending:26})).proposal?.size,4);
  assert.equal(proposal(input({slop:30,pending:30})).reason,'none');
  assert.equal(proposal(input({slop:70})).reason,'none');
  assert.equal(proposal(input({available:2})).proposal?.size,2);
});
test('proposal guards and ignore hysteresis', () => {
  for (const [over,reason] of [[{enabled:false},'disabled'],[{openBatch:true},'batch_open'],
    [{available:0},'none'],[{slop:30,ignoredMissing:30},'none']] as const) assert.equal(proposal(input(over)).reason,reason);
  assert.equal(proposal(input({slop:24,ignoredMissing:30})).proposal?.missing,36);
});

test('count migration resets percentage dismissals and preserves current settings and batches', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const f of readdirSync('migrations').filter(f => f < '0054').sort()) db.exec(readFileSync('migrations/' + f, 'utf8'));
    db.exec(`INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES
      ('slop_section_min_real','50','now'),('slop_auto_threshold_percent','33','now'),
      ('max_generation_attempts','4','now'),('editorial_tolerance','2','now'),
      ('image_quality','medium','now'),('open_game_hours','48','now'),('slop_auto_enabled','0','now');
      INSERT INTO slop_proposal_ignored(tag,spread_percent,created_at) VALUES('catalog-balance',60,'now');
      INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('kept','[]','[]','now','now');`);
    const kept = db.prepare("SELECT * FROM app_settings WHERE key NOT IN ('slop_section_min_real','slop_auto_threshold_percent') ORDER BY key").all();
    db.exec(readFileSync('migrations/0054_catalog_count_proposals.sql','utf8'));
    assert.deepEqual(db.prepare('SELECT * FROM app_settings ORDER BY key').all(), kept);
    assert.equal(db.prepare('SELECT count(*) AS n FROM slop_proposal_ignored').get()?.n, 0);
    db.exec("INSERT INTO slop_proposal_ignored(tag,missing_count,created_at) VALUES('catalog-balance',2,'now')");
    assert.equal(db.prepare('SELECT missing_count FROM slop_proposal_ignored').get()?.missing_count, 2);
    assert.equal(db.prepare('SELECT id FROM slop_batches').get()?.id, 'kept');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});
