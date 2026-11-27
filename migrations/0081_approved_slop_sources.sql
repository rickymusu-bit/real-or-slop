-- Private attribution supports current approved/published counts, never guessed from lifetime generation totals.
ALTER TABLE images ADD COLUMN slop_source_id TEXT REFERENCES images(id) ON DELETE SET NULL;
CREATE INDEX images_approved_slop_source ON images(slop_source_id) WHERE origin='SLOP' AND status IN ('approved','published');
-- Only a still-retained exact relation may be recovered. Deleted jobs cannot be reconstructed from timestamps or profiles.
WITH retained AS (
 SELECT j.image_id AS image,j.source_id AS source FROM pipeline_jobs j JOIN images r ON r.id=j.source_id AND r.origin='REAL' WHERE j.image_id IS NOT NULL
 UNION
 SELECT p.image_id,s.source_id FROM slop_processes p JOIN slop_gallery_sources s ON s.process_id=p.id
 JOIN images r ON r.id=s.source_id AND r.origin='REAL' WHERE p.image_id IS NOT NULL
), exact AS (SELECT image,MIN(source) AS source FROM retained GROUP BY image HAVING COUNT(DISTINCT source)=1)
UPDATE images SET slop_source_id=(SELECT source FROM exact WHERE image=images.id)
 WHERE origin='SLOP' AND slop_source_id IS NULL AND id IN (SELECT image FROM exact);
UPDATE galleries SET pipeline_settings=json_set(pipeline_settings,'$.environment','auto') WHERE json_valid(pipeline_settings);
