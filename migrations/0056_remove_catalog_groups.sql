-- Catalogue balance uses counts and private REAL-mother/SLOP-child allocation only.
-- Preserve legacy genre/time information as ordinary tags before removing group metadata.
CREATE TABLE slop_slots_0056 (
 kind TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL,
 payload TEXT NOT NULL, legacy TEXT, genre TEXT, decade TEXT,
 PRIMARY KEY(kind,id,position)
);
INSERT INTO slop_slots_0056(kind,id,position,payload,legacy)
 SELECT 'image',id,0,generation_slot,
   coalesce(json_extract(generation_slot,'$.group'),json_extract(generation_slot,'$.group_key'),generation_group)
 FROM images WHERE json_valid(generation_slot);
INSERT INTO slop_slots_0056(kind,id,position,payload,legacy)
 SELECT 'batch',b.id,CAST(j.key AS INTEGER),
   CASE j.type WHEN 'object' THEN j.value WHEN 'array' THEN j.value
     WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE json_quote(j.value) END,
   CASE WHEN j.type='object' THEN coalesce(json_extract(j.value,'$.group'),json_extract(j.value,'$.group_key'),b.group_key) END
 FROM slop_batches b,json_each(CASE WHEN json_valid(b.slots) THEN b.slots ELSE '[]' END) j;
INSERT INTO slop_slots_0056(kind,id,position,payload,legacy)
 SELECT 'prompt',b.id,CAST(j.key AS INTEGER),
   CASE j.type WHEN 'object' THEN j.value WHEN 'array' THEN j.value
     WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE json_quote(j.value) END,
   CASE WHEN j.type='object' THEN coalesce(json_extract(j.value,'$.group'),json_extract(j.value,'$.group_key')) END
 FROM slop_batches b,json_each(CASE WHEN json_valid(b.prompts) THEN b.prompts ELSE '[]' END) j;
UPDATE slop_slots_0056 SET genre=substr(legacy,1,instr(legacy,'/')-1),decade=substr(legacy,instr(legacy,'/')+1)
 WHERE typeof(legacy)='text' AND instr(legacy,'/') BETWEEN 2 AND 41
 AND substr(legacy,1,instr(legacy,'/')-1) NOT GLOB '*[^a-z0-9-]*'
 AND substr(legacy,instr(legacy,'/')+1) GLOB '[0-9][0-9][0-9]0s';
UPDATE slop_slots_0056 SET payload=json_set(payload,'$.tags',json('{}'))
 WHERE genre IS NOT NULL AND coalesce(json_type(payload,'$.tags'),'null') NOT IN ('array','object');
UPDATE slop_slots_0056 SET payload=json_set(payload,'$.tags',
 json_set(json_extract(payload,'$.tags'),'$.genre',coalesce(json_extract(payload,'$.tags.genre'),genre),
   '$.time',coalesce(json_extract(payload,'$.tags.time'),decade)))
 WHERE genre IS NOT NULL AND json_type(payload,'$.tags')='object';
UPDATE slop_slots_0056 SET payload=json_set(payload,'$.tags',json_insert(json_extract(payload,'$.tags'),
 '$[#]',json_object('label',genre,'category','genre')))
 WHERE genre IS NOT NULL AND json_type(payload,'$.tags')='array'
 AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.tags')) t WHERE CASE WHEN t.type='object' THEN json_extract(t.value,'$.category') END='genre');
UPDATE slop_slots_0056 SET payload=json_set(payload,'$.tags',json_insert(json_extract(payload,'$.tags'),
 '$[#]',json_object('label',decade,'category','time')))
 WHERE decade IS NOT NULL AND json_type(payload,'$.tags')='array'
 AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.tags')) t WHERE CASE WHEN t.type='object' THEN json_extract(t.value,'$.category') END='time');
UPDATE slop_slots_0056 SET payload=json_remove(payload,'$.group','$.group_key','$.generation_group');
UPDATE images SET generation_slot=(SELECT payload FROM slop_slots_0056 s WHERE s.kind='image' AND s.id=images.id)
 WHERE id IN (SELECT id FROM slop_slots_0056 WHERE kind='image');
UPDATE slop_batches SET slots=(SELECT json_group_array(json(payload)) FROM
 (SELECT payload FROM slop_slots_0056 s WHERE s.kind='batch' AND s.id=slop_batches.id ORDER BY position))
 WHERE id IN (SELECT id FROM slop_slots_0056 WHERE kind='batch');
UPDATE slop_batches SET prompts=(SELECT json_group_array(json(payload)) FROM
 (SELECT payload FROM slop_slots_0056 s WHERE s.kind='prompt' AND s.id=slop_batches.id ORDER BY position))
 WHERE id IN (SELECT id FROM slop_slots_0056 WHERE kind='prompt');
DROP TABLE slop_slots_0056;
UPDATE slop_batches SET auto_snapshot=json_remove(auto_snapshot,'$.group','$.group_key','$.groups','$.generation_group','$.genre','$.time')
 WHERE json_valid(auto_snapshot);
UPDATE slop_batches SET loop_settings=json_remove(loop_settings,'$.group','$.group_key','$.generation_group') WHERE json_valid(loop_settings);
UPDATE slop_processes SET snapshot=json_remove(snapshot,'$.group','$.group_key','$.generation_group') WHERE json_valid(snapshot);
ALTER TABLE images DROP COLUMN generation_group;
ALTER TABLE slop_batches DROP COLUMN group_key;
ALTER TABLE slop_batches DROP COLUMN auto_tag;
CREATE TABLE app_settings_0056 (
 key TEXT PRIMARY KEY CHECK(key IN ('image_quality','open_game_hours','max_generation_attempts','editorial_tolerance')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 40), updated_at TEXT NOT NULL
);
INSERT INTO app_settings_0056 SELECT * FROM app_settings
 WHERE key IN ('image_quality','open_game_hours','max_generation_attempts','editorial_tolerance');
DROP TABLE app_settings;
ALTER TABLE app_settings_0056 RENAME TO app_settings;
