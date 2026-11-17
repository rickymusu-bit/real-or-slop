import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
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
