-- Check the baseline BEFORE retiring a column required by the previous backend.
-- D1 applies each migration transactionally; an unbalanced legacy inventory
-- therefore aborts before any compatibility-changing operation.
CREATE TABLE retire_baseline_guard (balanced INTEGER CHECK(balanced=1));
INSERT INTO retire_baseline_guard SELECT CASE WHEN NOT EXISTS(
 SELECT demo FROM images WHERE status='approved' GROUP BY demo HAVING sum(type='REAL')!=sum(type='AI')
) THEN 1 ELSE 0 END;
DROP TABLE retire_baseline_guard;

-- Historical values remain private for audit; no operational replacement value.
CREATE TABLE legacy_image_difficulty (
 image_id TEXT PRIMARY KEY REFERENCES images(id),
 assigned_value TEXT NOT NULL,
 archived_at TEXT NOT NULL
);
INSERT INTO legacy_image_difficulty SELECT id,difficulty,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM images;
DROP INDEX image_status_difficulty;
ALTER TABLE images DROP COLUMN difficulty;
CREATE INDEX image_status_demo ON images(status,demo);
-- Keep historical event snapshots intact. Only the current editable plan loses
-- its retired selection; no scene/prompt/generation provenance is rewritten.
UPDATE slop_plans SET plan_json=json_remove(plan_json,'$.profile');
