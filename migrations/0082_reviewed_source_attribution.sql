-- Recover explicitly reviewed original/scene associations staged through authorized operational APIs.
-- No source is inferred by SQL. Verify both originals and never overwrite a retained source.
WITH reviewed AS (
 SELECT i.id,r.id AS source FROM images i JOIN images r
 ON r.id=json_extract(CASE WHEN json_valid(i.generation_slot) THEN i.generation_slot ELSE '{}' END,'$.source_attribution.source_id')
 AND r.origin='REAL'
 AND r.original_sha256=json_extract(CASE WHEN json_valid(i.generation_slot) THEN i.generation_slot ELSE '{}' END,'$.source_attribution.source_original_sha256')
 WHERE i.origin='SLOP'
 AND json_extract(CASE WHEN json_valid(i.generation_slot) THEN i.generation_slot ELSE '{}' END,'$.source_attribution.verified')=1
 AND json_extract(CASE WHEN json_valid(i.generation_slot) THEN i.generation_slot ELSE '{}' END,'$.source_attribution.method')='original_scene_review'
 AND i.original_sha256=json_extract(CASE WHEN json_valid(i.generation_slot) THEN i.generation_slot ELSE '{}' END,'$.source_attribution.original_sha256')
)
UPDATE images SET slop_source_id=(SELECT source FROM reviewed WHERE id=images.id)
WHERE slop_source_id IS NULL AND id IN (SELECT id FROM reviewed);
