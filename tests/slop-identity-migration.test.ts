/** Remove SLOP titles and inherited tags without changing REAL, observed tags, treatment or relationships. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('SLOP identity cleanup preserves REAL titles, copy style, observed tags and foreign keys', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for(const f of readdirSync('migrations').filter(f=>f<'0058').sort()) db.exec(readFileSync('migrations/'+f,'utf8'));
    const insert=db.prepare(`INSERT INTO images(id,origin,title,original_key,original_sha256,original_mime,width,height,
      generation_slot,created_at,updated_at) VALUES(?,?,?, ?,lower(hex(randomblob(32))),'image/png',40,50,?,'now','now')`);
    const slot={index:0,tags:[{label:'landscape',category:'genre'},{label:'black-and-white',category:'color'},
      {label:'photo-print',category:'medium'}],theme:['old-theme'],title:'Old generated label',target_metrics:{long:50,noise:3},
      process:'process',evaluation:{decision:'review_needed'},acceptance:{by:'owner',attempt:'attempt',at:'now'}};
    insert.run('mother','REAL','Original REAL title','mother-original',null);
    insert.run('child','SLOP','Old SLOP title','child-original',JSON.stringify(slot));
    insert.run('legacy','SLOP','Legacy SLOP title','legacy-original',JSON.stringify({tags:{color:'sepia',medium:'film-frame'}}));
    db.exec(`INSERT INTO tags(id,label,category,created_at) VALUES('actual','street','setting','now');
      INSERT INTO image_tags(image_id,tag_id) VALUES('child','actual');
      INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('batch','[]','[]','now','now');
      INSERT INTO slop_processes(id,batch_id,slot,image_id,state,snapshot,created_at,updated_at)
       VALUES('process','batch',0,'child','accepted','{"source_tags":{"genre":["landscape"]}}','now','now');
      INSERT INTO slop_reference_uses(source_id,process_id,image_id,created_at) VALUES('mother','process','child','now');
      INSERT INTO slop_attempts(id,process_id,number,prompt,candidate_key,created_at,updated_at)
       VALUES('attempt','process',1,'Saved prompt','candidate','now','now');
      INSERT INTO paid_calls(id,kind,model,status,image_id,process_id,attempt_id,created_at,updated_at)
       VALUES('paid','images','fake','completed','child','process','attempt','now','now');
      INSERT INTO game_sessions(id,mode,level,created_at,owner_hash) VALUES('session','levels','facile',0,'owner');
      INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) VALUES('round','session','child',0,'child-copy');`);
    const tables=['tags','image_tags','slop_batches','slop_processes','slop_reference_uses','slop_attempts','paid_calls','game_sessions','game_rounds'];
    const before=tables.map(t=>db.prepare('SELECT * FROM '+t).all());
    const columns=db.prepare('PRAGMA table_info(images)').all().map(c=>c.name as string).filter(c=>!['title','generation_slot'].includes(c));
    const images=()=>db.prepare('SELECT '+columns.join(',')+' FROM images ORDER BY id').all();
    const originals=images();
    db.exec(readFileSync('migrations/0058_slop_identity_and_copy_style.sql','utf8'));
    assert.deepEqual(images(),originals);
    for(let i=0;i<tables.length;i++) assert.deepEqual(db.prepare('SELECT * FROM '+tables[i]).all(),before[i],tables[i]);
    assert.equal(db.prepare("SELECT title FROM images WHERE id='mother'").get()?.title,'Original REAL title');
    assert.ok(db.prepare("SELECT title FROM images WHERE origin='SLOP'").all().every(r=>r.title===null));
    const child=JSON.parse(db.prepare("SELECT generation_slot FROM images WHERE id='child'").get()!.generation_slot as string);
    const {tags,theme,title,...preserved}=slot;
    assert.ok(tags.length && theme.length && title);
    assert.deepEqual(child,{...preserved,copy_style:{color:'black-and-white',medium:'photo-print'}});
    assert.deepEqual(JSON.parse(db.prepare("SELECT generation_slot FROM images WHERE id='legacy'").get()!.generation_slot as string),
      {copy_style:{color:'sepia',medium:'film-frame'}});
    assert.throws(()=>insert.run('bad-real','REAL',null,'bad-real-original',null));
    assert.throws(()=>insert.run('bad-slop','SLOP','Forbidden','bad-slop-original',null));
    assert.throws(()=>db.exec("UPDATE images SET title='Forbidden' WHERE id='child'"));
    assert.throws(()=>db.exec("UPDATE images SET title=NULL WHERE id='mother'"));
    assert.throws(()=>db.exec("UPDATE images SET title='' WHERE id='mother'"));
    insert.run('new-slop','SLOP',null,'new-slop-original',null);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    db.exec("DELETE FROM images WHERE id='mother'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM images WHERE id='child'").get()?.n,1);
  } finally {db.close();}
});
