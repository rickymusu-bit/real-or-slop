-- 2026-11-14T17:00:00Z: specs `libreria-immagini` 3.0.0, `generazione-slop` 2.0.1, `copie-di-gioco` 7.0.1 (owner decisions of
-- 2026-11-14). The category Format becomes Genre, Color and Medium; SLOP groups by genre and decade; measures of every game copy and
-- treatment of the SLOP.

-- 1. Tag categories. SQLite cannot change a CHECK in place: the tags table is rebuilt with the same columns, triggers and index.
-- Dropping it runs the ON DELETE CASCADE of image_tags and tag_aliases: their rows are copied first and put back. The trigger that
-- removes a tag with its last image is dropped first and created again, so that the cascade cannot touch the copies.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE keep_tags AS SELECT id,label,created_at,
 CASE WHEN category<>'format' THEN category
  WHEN label IN ('color','black-and-white','sepia','hand-colored') THEN 'color'
  WHEN label IN ('photo-print','newspaper-print','magazine-print','postcard','slide','film-still','instant-photo','digital-photo',
   'phone-photo','screen-capture','poster','painting','drawing','illustration') THEN 'medium'
  ELSE 'other' END AS category
 FROM tags;
CREATE TABLE keep_tag_aliases AS SELECT * FROM tag_aliases;
CREATE TABLE keep_image_tags AS SELECT * FROM image_tags;
DROP TRIGGER IF EXISTS tag_removed_with_last_image;
DROP TRIGGER IF EXISTS tag_not_an_alias;
DROP TABLE tags;
CREATE TABLE tags (
 id TEXT PRIMARY KEY,
 label TEXT NOT NULL UNIQUE CHECK(length(label) BETWEEN 1 AND 40 AND label NOT GLOB '*[^a-z0-9-]*'
   AND label NOT GLOB '-*' AND label NOT GLOB '*-' AND label NOT GLOB '*--*' AND label <> 'untagged'),
 created_at TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'other'
  CHECK(category IN ('time','genre','color','medium','place','setting','event','people','object','other'))
);
CREATE INDEX tags_category ON tags(category, label);
INSERT INTO tags(id,label,created_at,category) SELECT id,label,created_at,category FROM keep_tags;
DELETE FROM tag_aliases;
INSERT OR IGNORE INTO tag_aliases SELECT * FROM keep_tag_aliases;
DELETE FROM image_tags;
INSERT OR IGNORE INTO image_tags SELECT * FROM keep_image_tags;
DROP TABLE keep_tags;
DROP TABLE keep_tag_aliases;
DROP TABLE keep_image_tags;
CREATE TRIGGER tag_not_an_alias BEFORE INSERT ON tags
 WHEN EXISTS(SELECT 1 FROM tag_aliases WHERE alias=NEW.label)
 BEGIN SELECT RAISE(ABORT,'A tag cannot also be an alias'); END;
CREATE TRIGGER tag_removed_with_last_image AFTER DELETE ON image_tags
 WHEN NOT EXISTS(SELECT 1 FROM image_tags WHERE tag_id=OLD.tag_id)
 BEGIN DELETE FROM tags WHERE id=OLD.tag_id; END;

-- 2. Images: completion of the three categories (one paid call per image, ever), measures of the game copy, treatment of a SLOP,
-- group («genre/decade») a SLOP was generated for.
ALTER TABLE images ADD COLUMN categories_completed_at TEXT;
ALTER TABLE images ADD COLUMN copy_metrics TEXT;
ALTER TABLE images ADD COLUMN copy_treatment TEXT;
ALTER TABLE images ADD COLUMN generation_group TEXT;

-- 3. SLOP groups: the group of a batch; ignored proposals are now groups, the old ones (tags) lapse.
ALTER TABLE slop_batches ADD COLUMN group_key TEXT;
DELETE FROM slop_proposal_ignored;

-- 4. Settings: the threshold of a theme becomes the threshold of a group (5 REAL by default); the CHECK on the keys is rebuilt.
CREATE TABLE app_settings_0048 (
 key TEXT PRIMARY KEY CHECK(key IN ('image_quality','slop_section_min_real','slop_group_min_real','open_game_hours',
  'slop_auto_enabled','slop_auto_threshold_percent')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 40),
 updated_at TEXT NOT NULL
);
INSERT INTO app_settings_0048(key,value,updated_at) SELECT key,value,updated_at FROM app_settings WHERE key<>'slop_theme_min_real';
DROP TABLE app_settings;
ALTER TABLE app_settings_0048 RENAME TO app_settings;
