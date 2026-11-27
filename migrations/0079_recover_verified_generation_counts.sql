-- Recover only verifiable pre-counter generations, without retaining a REAL–SLOP relationship.
-- A completed evaluation proves that a candidate had already been saved. Initial generation
-- and edits share the same job prefix, so repeated image/evaluation calls count once.
ALTER TABLE images ADD COLUMN slop_legacy_generated_count INTEGER NOT NULL DEFAULT 0 CHECK(slop_legacy_generated_count>=0);

WITH cutoff AS (
 SELECT julianday(applied_at) AS stamp FROM d1_migrations WHERE name='0078_observed_slop_and_usage.sql'
), verified AS (
 SELECT DISTINCT substr(image.id,1,82) AS job, substr(image.id,47,36) AS source
 FROM paid_calls AS image
 WHERE image.kind='images' AND image.status='completed'
  AND length(image.id)=119 AND substr(image.id,1,9)='pipeline-'
  AND substr(image.id,46,1)='-' AND substr(image.id,83,1)='-'
  AND substr(image.id,47,36) GLOB '????????-????-????-????-????????????'
  AND length(replace(substr(image.id,47,36),'-',''))=32
  AND replace(substr(image.id,47,36),'-','') NOT GLOB '*[^0-9a-f]*'
  AND substr(image.id,10,36) GLOB '????????-????-????-????-????????????'
  AND length(replace(substr(image.id,10,36),'-',''))=32
  AND replace(substr(image.id,10,36),'-','') NOT GLOB '*[^0-9a-f]*'
  AND substr(image.id,84,36) GLOB '????????-????-????-????-????????????'
  AND length(replace(substr(image.id,84,36),'-',''))=32
  AND replace(substr(image.id,84,36),'-','') NOT GLOB '*[^0-9a-f]*'
  AND EXISTS (
   SELECT 1 FROM paid_calls AS review, cutoff
   WHERE review.kind='evaluation' AND review.status='completed'
    AND length(review.id)=119 AND substr(review.id,1,83)=substr(image.id,1,83)
    AND substr(review.id,84,36) GLOB '????????-????-????-????-????????????'
    AND length(replace(substr(review.id,84,36),'-',''))=32
    AND replace(substr(review.id,84,36),'-','') NOT GLOB '*[^0-9a-f]*'
    AND julianday(image.updated_at)<=julianday(review.created_at)
    AND julianday(review.updated_at)<cutoff.stamp
  )
), totals AS (
 SELECT source,count(*) AS n FROM verified GROUP BY source
)
UPDATE images SET
 slop_generated_count=slop_generated_count + COALESCE((SELECT n FROM totals WHERE source=images.id),0) - slop_legacy_generated_count,
 slop_legacy_generated_count=COALESCE((SELECT n FROM totals WHERE source=images.id),0)
WHERE origin='REAL';
