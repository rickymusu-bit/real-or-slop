-- v1.0.0, 2026-11-10T06:23:49Z: docs/libreria-immagini.v1.5.0.md, section 4. Owner decision of 2026-11-10: the caption has a soft
-- limit of 160 characters (a warning, never a cut) and a technical ceiling of 256. SQLite cannot change a CHECK in place,
-- so the images table is rebuilt with the same columns, constraints and index, caption up to 256 characters.
-- Dropping the old table runs its ON DELETE CASCADE actions (image_tags, then tags and aliases through the trigger
-- tag_removed_with_last_image, game_rounds, answers, challenge_answers): those rows are copied first and put back.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE keep_tags AS SELECT * FROM tags;
CREATE TABLE keep_tag_aliases AS SELECT * FROM tag_aliases;
CREATE TABLE keep_image_tags AS SELECT * FROM image_tags;
CREATE TABLE keep_game_rounds AS SELECT * FROM game_rounds;
CREATE TABLE keep_answers AS SELECT * FROM answers;
CREATE TABLE keep_challenge_answers AS SELECT * FROM challenge_answers;

CREATE TABLE images_rebuilt (
 id TEXT PRIMARY KEY,
 origin TEXT NOT NULL CHECK(origin IN ('REAL','SLOP')),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','approved','published','trash')),
 trashed_from TEXT CHECK(trashed_from IS NULL OR trashed_from IN ('new','approved')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1000),
 caption TEXT NOT NULL DEFAULT '' CHECK(length(caption) <= 256),
 explanation TEXT NOT NULL DEFAULT '' CHECK(length(explanation) <= 2000),
 source_url TEXT NOT NULL DEFAULT '',
 author TEXT NOT NULL DEFAULT '' CHECK(length(author) <= 300),
 license_name TEXT NOT NULL DEFAULT '' CHECK(length(license_name) <= 200),
 license_url TEXT NOT NULL DEFAULT '',
 prompt TEXT NOT NULL DEFAULT '' CHECK(length(prompt) <= 4000),
 model TEXT NOT NULL DEFAULT '' CHECK(length(model) <= 100),
 original_key TEXT NOT NULL UNIQUE,
 original_sha256 TEXT NOT NULL UNIQUE CHECK(length(original_sha256) = 64),
 original_mime TEXT NOT NULL CHECK(original_mime IN ('image/jpeg','image/png','image/webp')),
 width INTEGER NOT NULL CHECK(width > 0),
 height INTEGER NOT NULL CHECK(height > 0),
 copy_key TEXT UNIQUE,
 copy_sha256 TEXT CHECK(copy_sha256 IS NULL OR length(copy_sha256) = 64),
 copy_width INTEGER CHECK(copy_width IS NULL OR copy_width BETWEEN 1 AND 2048),
 copy_height INTEGER CHECK(copy_height IS NULL OR copy_height BETWEEN 1 AND 2048),
 copy_bytes INTEGER CHECK(copy_bytes IS NULL OR copy_bytes BETWEEN 1 AND 4000000),
 rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(rights_confirmed IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 approved_at TEXT,
 published_at TEXT,
 trashed_at TEXT,
 analysis_status TEXT NOT NULL DEFAULT 'none' CHECK(analysis_status IN ('none','running','done','uncertain','failed')),
 analysis_error TEXT NOT NULL DEFAULT '',
 analyzed_at TEXT,
 generated_caption TEXT,
 generated_tags TEXT,
 CHECK((copy_key IS NULL) = (copy_sha256 IS NULL)),
 CHECK(status IN ('new','trash') OR copy_key IS NOT NULL),
 CHECK(status <> 'trash' OR trashed_from IS NOT NULL)
);
INSERT INTO images_rebuilt (id,origin,status,trashed_from,title,description,caption,explanation,source_url,author,license_name,
 license_url,prompt,model,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,copy_width,copy_height,
 copy_bytes,rights_confirmed,revision,created_at,updated_at,approved_at,published_at,trashed_at,analysis_status,analysis_error,
 analyzed_at,generated_caption,generated_tags)
SELECT id,origin,status,trashed_from,title,description,caption,explanation,source_url,author,license_name,
 license_url,prompt,model,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,copy_width,copy_height,
 copy_bytes,rights_confirmed,revision,created_at,updated_at,approved_at,published_at,trashed_at,analysis_status,analysis_error,
 analyzed_at,generated_caption,generated_tags FROM images;
DROP TABLE images;
ALTER TABLE images_rebuilt RENAME TO images;
CREATE INDEX images_status ON images(status, origin, updated_at);

INSERT OR IGNORE INTO tags SELECT * FROM keep_tags;
INSERT OR IGNORE INTO tag_aliases SELECT * FROM keep_tag_aliases;
INSERT OR IGNORE INTO image_tags SELECT * FROM keep_image_tags;
INSERT OR IGNORE INTO game_rounds SELECT * FROM keep_game_rounds;
INSERT OR IGNORE INTO answers SELECT * FROM keep_answers;
INSERT OR IGNORE INTO challenge_answers SELECT * FROM keep_challenge_answers;
DROP TABLE keep_tags;
DROP TABLE keep_tag_aliases;
DROP TABLE keep_image_tags;
DROP TABLE keep_game_rounds;
DROP TABLE keep_answers;
DROP TABLE keep_challenge_answers;
