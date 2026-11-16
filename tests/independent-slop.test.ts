import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
test('migration erases source links without cascading processes, attempts or calls', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for(const f of readdirSync('migrations').filter(f=>f<'0053').sort()) db.exec(readFileSync('migrations/'+f,'utf8'));
    db.exec(`INSERT INTO images(id,origin,status,title,original_key,original_sha256,original_mime,width,height,created_at,updated_at,real_description)
      VALUES('reference','REAL','new','source','original','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','image/png',100,200,'now','now','{"visible":"A street","documented_context":"","uncertainties":""}');
      INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('batch','[]','[{"source":"reference","sample":"reference","title":"source","tags":[]}]','now','now');
      INSERT INTO slop_processes(id,batch_id,slot,source_id,state,snapshot,created_at,updated_at) VALUES('process','batch',0,'reference','review_needed','{}','now','now');
      INSERT INTO slop_attempts(id,process_id,number,prompt,created_at,updated_at) VALUES('attempt','process',1,'prompt','now','now');
      INSERT INTO paid_calls(id,kind,model,status,process_id,attempt_id,created_at,updated_at) VALUES('call','images','fake','uncertain','process','attempt','now','now');`);
    db.exec(readFileSync('migrations/0053_independent_slop.sql','utf8'));
    assert.equal(db.prepare('SELECT slots FROM slop_batches').get()?.slots,'[{"title":"Proposta 1","tags":[]}]');
    const snapshot=JSON.parse(db.prepare('SELECT snapshot FROM slop_processes').get()!.snapshot as string);
    assert.equal(snapshot.source_description.visible,'A street'); assert.equal(snapshot.height,200);
    db.exec("DELETE FROM images WHERE id='reference'");
    assert.equal(db.prepare('SELECT count(*) AS n FROM slop_processes').get()?.n,1);
    assert.equal(db.prepare('SELECT process_id FROM paid_calls').get()?.process_id,'process');
    assert.equal(db.prepare('SELECT process_id FROM slop_attempts').get()?.process_id,'process');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.ok(!db.prepare('PRAGMA table_info(images)').all().some(c=>c.name==='generation_source'));
  } finally {db.close();}
});
