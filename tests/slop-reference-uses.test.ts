import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {compositionAt} from '../shared/slop-composition';

test('existing linked sources are withdrawn, retained for open games, and released only when their child is deleted', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    const withdrawal = '0059_slop_source_game_exclusion.sql';
    for (const f of readdirSync('migrations').sort().filter(f => f < withdrawal)) db.exec(readFileSync('migrations/'+f,'utf8'));
    const image = db.prepare(`INSERT INTO images(id,origin,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
      VALUES(?,?,?,lower(hex(randomblob(16))),?,'image/png',100,100,'now','now')`);
    image.run('mother','REAL','mother','a'.repeat(64));
    image.run('child','SLOP',null,'b'.repeat(64));
    db.prepare("UPDATE images SET status='published',published_at='now',copy_key='mother-copy',copy_sha256=? WHERE id='mother'").run('d'.repeat(64));
    db.prepare("UPDATE images SET copy_key='child-copy',copy_sha256=?,trashed_from='new' WHERE id='child'").run('c'.repeat(64));
    db.exec(`INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('batch','[]','[]','now','now');
      INSERT INTO slop_processes(id,batch_id,slot,snapshot,created_at,updated_at) VALUES('process','batch',0,'{}','now','now');
      INSERT INTO slop_reference_uses(source_id,process_id,created_at) VALUES('mother','process','now');`);
    assert.throws(()=>db.exec("INSERT INTO slop_reference_uses(source_id,created_at) VALUES('mother','now')"));
    db.exec("UPDATE slop_reference_uses SET image_id='child'; UPDATE slop_processes SET image_id='child',state='accepted'");
    db.exec(readFileSync('migrations/'+withdrawal,'utf8'));
    assert.equal(db.prepare("SELECT status FROM images WHERE id='mother'").get()?.status, 'approved');
    assert.equal(db.prepare("SELECT image_id FROM retired_copies WHERE copy_key='mother-copy'").get()?.image_id, 'mother');
    assert.equal(db.prepare('SELECT state FROM slop_source_states').get()?.state, 'unapproved');
    db.exec("UPDATE images SET approved_at='now' WHERE id='child'");
    for (const status of ['new','approved','published','trash']) {
      db.prepare('UPDATE images SET status=? WHERE id=\'child\'').run(status);
      assert.equal(db.prepare('SELECT count(*) AS n FROM slop_reference_uses').get()?.n,1);
      assert.equal(db.prepare('SELECT state FROM slop_source_states').get()?.state, 'approved');
    }
    db.exec("DELETE FROM slop_batches WHERE id='batch'");
    assert.equal(db.prepare('SELECT process_id FROM slop_reference_uses').get()?.process_id,null);
    assert.equal(db.prepare('SELECT count(*) AS n FROM slop_reference_uses').get()?.n,1);
    db.exec("DELETE FROM images WHERE id='child'");
    assert.equal(db.prepare('SELECT count(*) AS n FROM slop_reference_uses').get()?.n,0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    db.exec(`INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('batch2','[]','[]','now','now');
      INSERT INTO slop_processes(id,batch_id,slot,snapshot,created_at,updated_at) VALUES('failed','batch2',0,'{}','now','now');
      INSERT INTO slop_reference_uses(source_id,process_id,created_at) VALUES('mother','failed','now');`);
    assert.equal(db.prepare('SELECT state FROM slop_source_states').get()?.state, 'pending');
    db.exec("UPDATE slop_processes SET state='closed' WHERE id='failed'");
    assert.equal(db.prepare('SELECT count(*) AS n FROM slop_reference_uses').get()?.n,0);
  } finally {db.close();}
});
test('optional compositions include frontal, symmetrical and simple scenes across the rotation', () => {
  const cycle = Array.from({length:6},(_,i)=>compositionAt(i));
  assert.equal(new Set(cycle).size,6);
  assert.equal(cycle.filter(s=>/straight-on|frontal/.test(s)).length,3);
  assert.ok(cycle.some(s=>s.includes('centred, symmetrical')));
  assert.ok(cycle.some(s=>s.includes('single subject against a plain or quiet background')));
  assert.equal(compositionAt(6),compositionAt(0));
  assert.ok(cycle.every(s=>s.startsWith('Optional composition preference') && s.includes('Do not add extra people')));
});
