-- 2026-11-16: anonymous editorial snapshots; no persistent REAL/SLOP relationship.
-- Preserve process IDs, attempts, paid calls and all existing image bytes.
UPDATE slop_processes SET snapshot=json_set(snapshot,
 '$.source_description',json(coalesce(json_extract(snapshot,'$.source_description'),(SELECT real_description FROM images WHERE id=source_id),'null')),
 '$.source_tags',json(coalesce(json_extract(snapshot,'$.source_tags'),'{}')),
 '$.width',(SELECT width FROM images WHERE id=source_id),
 '$.height',(SELECT height FROM images WHERE id=source_id),
 '$.target_metrics',json(coalesce((SELECT copy_metrics FROM images WHERE id=source_id),'null')));
UPDATE images SET generation_slot=json_set(json_remove(generation_slot,'$.source','$.sample'),
 '$.target_metrics',json(coalesce((SELECT copy_metrics FROM images r WHERE r.id=images.generation_source),'null')))
 WHERE json_valid(generation_slot);
UPDATE images SET copy_treatment=json_remove(copy_treatment,'$.sample.id') WHERE json_valid(copy_treatment);
UPDATE images SET title='SLOP' WHERE origin='SLOP' AND title LIKE 'Da REAL: %';
UPDATE slop_batches SET slots=coalesce((SELECT json_group_array(json_set(json_remove(value,'$.source','$.sample'),'$.title','Proposta '||(CAST(key AS INTEGER)+1))) FROM json_each(slop_batches.slots)), '[]')
 WHERE json_valid(slots);
DROP INDEX slop_process_source;
ALTER TABLE slop_processes DROP COLUMN source_id;
DROP INDEX images_generation_source;
ALTER TABLE images DROP COLUMN generation_source;
DELETE FROM slop_proposal_ignored WHERE tag='twins';
