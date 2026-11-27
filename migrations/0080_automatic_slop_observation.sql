-- A durable per-photo claim prevents automatic retries after an uncertain job is closed.
ALTER TABLE images ADD COLUMN slop_observation_request TEXT;
-- Preserve already authorized observations, including attempts whose temporary job was removed.
UPDATE images SET slop_observation_request=COALESCE(
 (SELECT request FROM pipeline_jobs WHERE source_id=images.id AND json_extract(snapshot,'$.operation')='observe'
  ORDER BY created_at,id LIMIT 1),
 (SELECT substr(id,10,36) FROM paid_calls WHERE kind='analysis' AND length(id)=119
  AND substr(id,1,9)='pipeline-' AND substr(id,47,36)=images.id ORDER BY created_at,id LIMIT 1)
) WHERE origin='SLOP';
