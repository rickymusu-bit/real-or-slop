-- Retire the optional subject lookup and environment embeddings. Keep descriptions, profiles and paid-call history.
DROP TRIGGER IF EXISTS real_environment_invalidate;
DROP INDEX IF EXISTS images_real_subject_brand;
DROP INDEX IF EXISTS images_real_subject_family;
DROP INDEX IF EXISTS images_real_subject_model;
DROP TABLE IF EXISTS real_environment_vectors;

UPDATE images SET visual_description=json_remove(visual_description, '$.subject')
  WHERE visual_description IS NOT NULL AND json_type(visual_description, '$.subject') IS NOT NULL;

-- An obsolete indexing request cannot resume after its storage/API are retired. Never resend a pending paid call.
UPDATE paid_calls SET status='uncertain',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE status='pending' AND id LIKE 'real-index-%';
UPDATE images SET visual_description_request=NULL,visual_description_claimed_at=NULL
  WHERE visual_description_request LIKE 'real-index-%';
