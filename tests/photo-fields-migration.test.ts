/** Retiring unused photo fields must preserve all remaining data and relationships. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('photo field cleanup preserves every other column, active rounds and mother/child allocation', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for(const f of readdirSync('migrations').filter(f=>f<'0057').sort()) db.exec(readFileSync('migrations/'+f,'utf8'));
    const image=db.prepare(`INSERT INTO images(id,origin,status,title,description,caption,generated_caption,explanation,
      source_url,author,license_name,license_url,prompt,model,original_key,original_sha256,original_mime,width,height,
      copy_key,copy_sha256,copy_width,copy_height,copy_bytes,copy_crop,copy_view,copy_metrics,copy_treatment,
      real_description,commons_description,created_at,updated_at)
      VALUES(?,?,'published',?,'Description','Retired caption','Retired generated caption','Unused explanation',
      'https://commons.wikimedia.org/wiki/File:Source','Photographer','CC BY 4.0','https://creativecommons.org/licenses/by/4.0/',
      'Saved prompt','Saved model',?,?,'image/png',40,50,?,?,40,50,200,'{"x":0,"y":0,"width":40,"height":50,"format":"4:5"}',
      '{"x":0,"y":0,"height":25}','{"version":3}','{"version":5}',
      '{"visible":"Saved description","documented_context":"Context","uncertainties":"Unknown date"}',
      'Original Commons description','now','now')`);
    for(const [id,origin,sha] of [['mother','REAL','a'],['child','SLOP','b']])
      image.run(id,origin,id,id+'-original',sha.repeat(64),id+'-copy',sha.repeat(64));
    db.exec(`INSERT INTO tags(id,label,category,created_at) VALUES('tag','street','setting','now');
      INSERT INTO image_tags(image_id,tag_id) VALUES('mother','tag'),('child','tag');
      INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES('batch','[]','[]','now','now');
      INSERT INTO slop_processes(id,batch_id,slot,image_id,state,snapshot,created_at,updated_at)
       VALUES('process','batch',0,'child','accepted','{"source_description":{"visible":"A street"}}','now','now');
      INSERT INTO slop_reference_uses(source_id,process_id,image_id,created_at) VALUES('mother','process','child','now');
      INSERT INTO slop_attempts(id,process_id,number,prompt,candidate_key,created_at,updated_at)
       VALUES('attempt','process',1,'Saved prompt','candidate','now','now');
      INSERT INTO paid_calls(id,kind,model,status,image_id,process_id,attempt_id,created_at,updated_at)
       VALUES('paid','images','fake','completed','child','process','attempt','now','now');
      INSERT INTO game_sessions(id,mode,level,created_at,owner_hash,phase) VALUES('session','levels','facile',0,'owner','active');
      INSERT INTO game_rounds(id,session_id,image_id,position,copy_key,caption,copy_view)
       VALUES('round','session','mother',0,'mother-copy','Retired caption','{"x":0,"y":0,"height":25}');
      INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) VALUES('round','REAL',1,100,20);`);
    const retired: Record<string,string[]>={images:['caption','generated_caption','explanation','copy_view'],game_rounds:['caption','copy_view']};
    const tables=['images','game_rounds','tags','image_tags','slop_batches','slop_processes','slop_reference_uses',
      'slop_attempts','paid_calls','game_sessions','answers'];
    const columns=new Map(tables.map(t=>[t,db.prepare('PRAGMA table_info('+t+')').all()
      .map(c=>c.name as string).filter(c=>!(retired[t] || []).includes(c))]));
    const rows=(t: string)=>db.prepare('SELECT '+columns.get(t)!.join(',')+' FROM '+t+' ORDER BY rowid').all();
    const before=tables.map(rows);
    db.exec(readFileSync('migrations/0057_remove_unused_photo_fields.sql','utf8'));
    for(let i=0;i<tables.length;i++) {
      assert.deepEqual(rows(tables[i]),before[i],tables[i]);
      assert.deepEqual(db.prepare('PRAGMA table_info('+tables[i]+')').all().map(c=>c.name),columns.get(tables[i]));
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    db.exec("DELETE FROM images WHERE id='mother'");
    assert.equal(db.prepare("SELECT image_id FROM slop_processes WHERE id='process'").get()?.image_id,'child');
    assert.equal(db.prepare("SELECT count(*) AS n FROM images WHERE id='child'").get()?.n,1);
  } finally {db.close();}
});
