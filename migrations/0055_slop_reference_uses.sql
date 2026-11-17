-- Private allocation only: no pairing or exclusion in the game, no inferred historical links.
CREATE TABLE slop_reference_uses (
 source_id TEXT PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
 process_id TEXT UNIQUE REFERENCES slop_processes(id) ON DELETE SET NULL,
 image_id TEXT UNIQUE REFERENCES images(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL
);
-- A closed unsuccessful process releases its reservation. A surviving child keeps its mother occupied.
CREATE TRIGGER slop_reference_closed AFTER UPDATE OF state ON slop_processes
 WHEN NEW.state='closed'
 BEGIN
 DELETE FROM slop_reference_uses WHERE process_id=NEW.id AND image_id IS NULL;
 END;
CREATE TRIGGER slop_reference_process_deleted AFTER DELETE ON slop_processes
 BEGIN
 DELETE FROM slop_reference_uses WHERE process_id IS NULL AND image_id IS NULL;
 END;
DELETE FROM app_settings WHERE key='slop_auto_enabled';
DROP TABLE slop_proposal_ignored;
