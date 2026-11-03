-- Current editorial policy is separate from immutable historical evaluations.
ALTER TABLE editorial_controls ADD COLUMN editorial_threshold REAL NOT NULL DEFAULT 50 CHECK(editorial_threshold BETWEEN 0 AND 100);
ALTER TABLE editorial_controls ADD COLUMN policy_actor TEXT NOT NULL DEFAULT 'migration:0013';
CREATE TABLE editorial_policy_events (
 id TEXT PRIMARY KEY, previous_threshold REAL NOT NULL, threshold REAL NOT NULL,
 actor TEXT NOT NULL, created_at TEXT NOT NULL
);
INSERT INTO editorial_policy_events VALUES('default-threshold-50',65,50,'migration:0013',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER editorial_policy_changed AFTER UPDATE OF editorial_threshold ON editorial_controls
WHEN OLD.editorial_threshold!=NEW.editorial_threshold
BEGIN
 INSERT INTO editorial_policy_events VALUES(lower(hex(randomblob(16))),OLD.editorial_threshold,NEW.editorial_threshold,NEW.policy_actor,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 DELETE FROM editorial_preparations WHERE image_id IN (SELECT id FROM images WHERE status='in-review');
END;
CREATE TRIGGER editorial_policy_events_no_update BEFORE UPDATE ON editorial_policy_events BEGIN SELECT RAISE(ABORT,'Editorial policy audit is immutable'); END;
CREATE TRIGGER editorial_policy_events_no_delete BEFORE DELETE ON editorial_policy_events BEGIN SELECT RAISE(ABORT,'Editorial policy audit is immutable'); END;
-- Existing canonical provider/source IDs can associate a newly eligible image
-- with its original generation without rewriting an immutable attempt/dossier.
CREATE VIEW editorial_attempt_images AS
 SELECT a.id,a.reference_id,
 COALESCE(a.image_id,(SELECT i.id FROM images i JOIN sources s ON s.id=i.source_id
   WHERE i.type='AI' AND s.provider='openai-editorial' AND s.source_id=a.id
   AND i.sha256=json_extract(a.dossier_json,'$.sha256')
   AND i.ai_model=json_extract(a.dossier_json,'$.model')
   AND i.ai_prompt=json_extract(a.dossier_json,'$.prompt'))) AS image_id,
 a.dossier_json,a.created_at,a.image_id AS original_image_id
 FROM editorial_attempts a;
