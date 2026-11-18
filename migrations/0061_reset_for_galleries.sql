-- Owner decision, 2026-11-18: start the gallery release with an empty application database.
-- Keep D1 migration metadata and objects in R2. Retire the permanent REAL-to-SLOP registry.
DROP VIEW slop_source_states;
DROP TRIGGER slop_source_withdraw;
DROP TRIGGER slop_reference_closed;
DROP TRIGGER slop_reference_process_deleted;
DROP TABLE slop_reference_uses;

DELETE FROM leaderboard;
DELETE FROM answers;
DELETE FROM media_events;
DELETE FROM game_rounds;
DELETE FROM game_sessions;
DELETE FROM paid_calls;
DELETE FROM slop_gallery_sources;
DELETE FROM slop_attempts;
DELETE FROM slop_processes;
DELETE FROM slop_batches;
DELETE FROM retired_copies;
DELETE FROM image_tags;
DELETE FROM images;
DELETE FROM tag_aliases;
DELETE FROM tags;
DELETE FROM galleries;
DELETE FROM model_contexts;
DELETE FROM app_settings;
DELETE FROM settings;
DELETE FROM rate_limits;

CREATE TRIGGER images_gallery_insert BEFORE INSERT ON images WHEN NEW.gallery_id IS NULL
BEGIN
 SELECT RAISE(ABORT,'gallery required');
END;
CREATE TRIGGER images_gallery_update BEFORE UPDATE OF gallery_id ON images WHEN NEW.gallery_id IS NULL
BEGIN
 SELECT RAISE(ABORT,'gallery required');
END;
CREATE TRIGGER slop_batches_gallery_insert BEFORE INSERT ON slop_batches WHEN NEW.gallery_id IS NULL
BEGIN
 SELECT RAISE(ABORT,'gallery required');
END;
CREATE TRIGGER slop_batches_gallery_update BEFORE UPDATE OF gallery_id ON slop_batches WHEN NEW.gallery_id IS NULL
BEGIN
 SELECT RAISE(ABORT,'gallery required');
END;
