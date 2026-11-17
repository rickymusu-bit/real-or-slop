/** Removing catalogue groups must preserve images, ordinary tags, paid work and mother/child allocation. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('group removal preserves active data and converts legacy context into ordinary genre/time tags', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for(const f of readdirSync('migrations').filter(f=>f<'0056').sort()) db.exec(readFileSync('migrations/'+f,'utf8'));
    const slots=[{index:0,group:'press-photo/1960s',tags:{medium:'photo-print'}},
      {index:1,tags:[{label:'landscape',category:'genre'},{label:'1980s',category:'time'}]},true,null,'legacy note'];
    db.prepare(`INSERT INTO slop_batches(id,theme,slots,prompts,group_key,auto_tag,auto_snapshot,loop_settings,created_at,updated_at)
      VALUES('batch','[]',?,?,'press-photo/1960s','press-photo/1960s',?,?, 'now','now')`).run(
      JSON.stringify(slots),JSON.stringify([{prompt:'Saved paid prompt',group:'press-photo/1960s'}]),
      JSON.stringify({group:'press-photo/1960s',genre:'press-photo',time:'1960s',n_real:3,n_slop:1,size:1}),
      JSON.stringify({max_generation_attempts:3,group:'press-photo/1960s'}));
    const image=db.prepare(`INSERT INTO images(id,origin,status,title,original_key,original_sha256,original_mime,width,height,
      copy_key,copy_sha256,generation_batch,generation_group,generation_slot,created_at,updated_at)
      VALUES(?,?,'approved',?,?,?,'image/png',100,100,?,?,'batch','press-photo/1960s',?,'now','now')`);
    for(const [id,origin,sha] of [['mother','REAL','a'],['child','SLOP','b']])
      image.run(id,origin,id,id+'-original',sha.repeat(64),id+'-copy',sha.repeat(64),JSON.stringify(slots[0]));
    db.exec(`INSERT INTO tags(id,label,category,created_at) VALUES('genre','press-photo','genre','now');
      INSERT INTO image_tags(image_id,tag_id) VALUES('mother','genre');
      INSERT INTO slop_processes(id,batch_id,slot,image_id,state,snapshot,created_at,updated_at)
       VALUES('process','batch',0,'child','accepted','{"source_tags":{"genre":["press-photo"]},"group":"press-photo/1960s"}','now','now');
      INSERT INTO slop_reference_uses(source_id,process_id,image_id,created_at) VALUES('mother','process','child','now');
      INSERT INTO slop_attempts(id,process_id,number,prompt,candidate_key,created_at,updated_at)
       VALUES('attempt','process',1,'Saved paid prompt','private-candidate','now','now');
      INSERT INTO paid_calls(id,kind,model,status,image_id,process_id,attempt_id,created_at,updated_at)
       VALUES('paid','images','fake','completed','child','process','attempt','now','now');
      INSERT INTO game_sessions(id,mode,level,created_at,owner_hash) VALUES('session','levels','facile',0,'owner');
      INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) VALUES('round','session','child',0,'child-copy');
      INSERT INTO app_settings(key,value,updated_at) VALUES('image_quality','medium','now'),('open_game_hours','72','now'),
       ('max_generation_attempts','4','now'),('editorial_tolerance','2','now'),('slop_group_min_real','99','now');`);
    const preserved=['tags','image_tags','slop_reference_uses','slop_attempts','paid_calls','game_sessions','game_rounds'];
    const before=preserved.map(t=>db.prepare('SELECT * FROM '+t).all());
    const images=db.prepare('SELECT id,origin,status,original_key,original_sha256,copy_key,copy_sha256 FROM images ORDER BY id').all();
    db.exec(readFileSync('migrations/0056_remove_catalog_groups.sql','utf8'));
    for(let i=0;i<preserved.length;i++) assert.deepEqual(db.prepare('SELECT * FROM '+preserved[i]).all(),before[i],preserved[i]);
    assert.deepEqual(db.prepare('SELECT id,origin,status,original_key,original_sha256,copy_key,copy_sha256 FROM images ORDER BY id').all(),images);
    assert.ok(!db.prepare('PRAGMA table_info(images)').all().some(c=>c.name==='generation_group'));
    assert.ok(!db.prepare('PRAGMA table_info(slop_batches)').all().some(c=>['group_key','auto_tag'].includes(c.name as string)));
    const batch=db.prepare('SELECT * FROM slop_batches').get()!;
    const upgraded=JSON.parse(batch.slots as string);
    assert.deepEqual(upgraded[0],{index:0,tags:{medium:'photo-print',genre:'press-photo',time:'1960s'}});
    assert.deepEqual(upgraded.slice(1),slots.slice(1));
    assert.equal(JSON.parse(batch.prompts as string)[0].prompt,'Saved paid prompt');
    assert.deepEqual(JSON.parse(batch.auto_snapshot as string),{n_real:3,n_slop:1,size:1});
    assert.deepEqual(JSON.parse(batch.loop_settings as string),{max_generation_attempts:3});
    assert.deepEqual(JSON.parse(db.prepare('SELECT snapshot FROM slop_processes').get()!.snapshot as string),{source_tags:{genre:['press-photo']}});
    for(const row of db.prepare('SELECT generation_slot FROM images').all())
      assert.equal(JSON.parse(row.generation_slot as string).group,undefined);
    assert.equal(db.prepare("SELECT count(*) AS n FROM app_settings WHERE key='slop_group_min_real'").get()?.n,0);
    assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='max_generation_attempts'").get()?.value,'4');
    assert.throws(()=>db.exec("INSERT INTO app_settings(key,value,updated_at) VALUES('slop_group_min_real','1','now')"));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    db.exec("DELETE FROM images WHERE id='mother'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM images WHERE id='child'").get()?.n,1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM slop_processes WHERE id='process'").get()?.n,1);
  } finally {db.close();}
});
