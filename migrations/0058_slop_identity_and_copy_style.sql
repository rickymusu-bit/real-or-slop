-- SLOP have no title and keep no inherited catalogue tags. REAL titles remain required.
-- Preserve the two technical treatment settings before discarding the copied tag set.
UPDATE images SET generation_slot=json_set(generation_slot,'$.copy_style',json_object(
'color',coalesce(json_extract(generation_slot,'$.copy_style.color'),
  CASE json_type(generation_slot,'$.tags')
   WHEN 'array' THEN (SELECT json_extract(t.value,'$.label') FROM json_each(generation_slot,'$.tags') t
     WHERE CASE WHEN t.type='object' THEN json_extract(t.value,'$.category') END='color' LIMIT 1)
   WHEN 'object' THEN CASE json_type(generation_slot,'$.tags.color')
     WHEN 'array' THEN json_extract(generation_slot,'$.tags.color[0]')
     ELSE json_extract(generation_slot,'$.tags.color') END END,''),
'medium',coalesce(json_extract(generation_slot,'$.copy_style.medium'),
  CASE json_type(generation_slot,'$.tags')
   WHEN 'array' THEN (SELECT json_extract(t.value,'$.label') FROM json_each(generation_slot,'$.tags') t
     WHERE CASE WHEN t.type='object' THEN json_extract(t.value,'$.category') END='medium' LIMIT 1)
   WHEN 'object' THEN CASE json_type(generation_slot,'$.tags.medium')
     WHEN 'array' THEN json_extract(generation_slot,'$.tags.medium[0]')
     ELSE json_extract(generation_slot,'$.tags.medium') END END,''))) WHERE origin='SLOP' AND json_valid(generation_slot) AND json_type(generation_slot)='object';
UPDATE images SET generation_slot=json_remove(generation_slot,'$.tags','$.theme','$.title')
 WHERE origin='SLOP' AND json_valid(generation_slot);
-- Change title nullability without rebuilding the parent table or cascading any foreign keys.
ALTER TABLE images ADD COLUMN real_title_0058 TEXT;
UPDATE images SET real_title_0058=title WHERE origin='REAL';
ALTER TABLE images DROP COLUMN title;
ALTER TABLE images RENAME COLUMN real_title_0058 TO title;
CREATE TRIGGER images_title_insert BEFORE INSERT ON images
 WHEN (NEW.origin='REAL' AND (NEW.title IS NULL OR length(NEW.title) NOT BETWEEN 1 AND 200))
 OR (NEW.origin='SLOP' AND NEW.title IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'REAL require a title; SLOP have no title'); END;
CREATE TRIGGER images_title_update BEFORE UPDATE OF title,origin ON images
 WHEN (NEW.origin='REAL' AND (NEW.title IS NULL OR length(NEW.title) NOT BETWEEN 1 AND 200))
 OR (NEW.origin='SLOP' AND NEW.title IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'REAL require a title; SLOP have no title'); END;
