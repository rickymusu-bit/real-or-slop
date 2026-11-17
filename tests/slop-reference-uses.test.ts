import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {compositionAt} from '../shared/slop-composition';

test('reference remains occupied in every child state and across process deletion; only image deletion releases it', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const f of readdirSync('migrations').sort()) db.exec(readFileSync('migrations/'+f,'utf8'));
    const image = db.prepare(`INSERT INTO images(id,origin,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at)
      VALUES(?,?,?,lower(hex(randomblob(16))),?,'image/png',100,100,'now','now')`);
    image.run('mother','REAL','mother','a'.repeat(64));
    image.run('child','SLOP','child','b'.repeat(64));
    db.prepare("UPDATE images SET copy_key='child-copy',copy_sha256=?,trashed_from='new' WHERE id='child'").run('c'.repeat(64));
    db.exec(`INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('batch','[]','[]','now','now');
      INSERT INTO slop_processes(id,batch_id,slot,snapshot,created_at,updated_at) VALUES('process','batch',0,'{}','now','now');
      INSERT INTO slop_reference_uses(source_id,process_id,created_at) VALUES('mother','process','now');`);
    assert.throws(()=>db.exec("INSERT INTO slop_reference_uses(source_id,created_at) VALUES('mother','now')"));
    db.exec("UPDATE slop_reference_uses SET image_id='child'; UPDATE slop_processes SET image_id='child',state='accepted'");
    for (const status of ['new','approved','published','trash']) {
      db.prepare('UPDATE images SET status=? WHERE id=\'child\'').run(status);
      assert.equal(db.prepare('SELECT count(*) AS n FROM slop_reference_uses').get()?.n,1);
    }
    db.exec("DELETE FROM slop_batches WHERE id='batch'");
    assert.equal(db.prepare('SELECT process_id FROM slop_reference_uses').get()?.process_id,null);
    assert.equal(db.prepare('SELECT count(*) AS n FROM slop_reference_uses').get()?.n,1);
    db.exec("DELETE FROM images WHERE id='child'");
    assert.equal(db.prepare('SELECT count(*) AS n FROM slop_reference_uses').get()?.n,0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    db.exec(`INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('batch2','[]','[]','now','now');
      INSERT INTO slop_processes(id,batch_id,slot,snapshot,created_at,updated_at) VALUES('failed','batch2',0,'{}','now','now');
      INSERT INTO slop_reference_uses(source_id,process_id,created_at) VALUES('mother','failed','now');
      UPDATE slop_processes SET state='closed' WHERE id='failed';`);
    assert.equal(db.prepare('SELECT count(*) AS n FROM slop_reference_uses').get()?.n,0);
  } finally {db.close();}
});
test('composition cycle covers every placement/gaze combination and does not force subjects', () => {
  const cycle = Array.from({length:9},(_,i)=>compositionAt(i));
  assert.equal(new Set(cycle).size,9);
  for (const position of ['near the centre','towards the right side','towards the left side'])
    assert.equal(cycle.filter(s=>s.includes('weight '+position)).length,3);
  assert.equal(compositionAt(9),compositionAt(0));
  assert.ok(cycle.every(s=>s.includes('ignore the gaze preference') && s.includes('do not invent a person')));
});
