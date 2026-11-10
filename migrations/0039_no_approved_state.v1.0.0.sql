-- v1.0.0, 2026-11-10T17:15:02Z: docs/libreria-immagini.v1.8.0.md, section 2. Owner decision of 2026-11-10: «Un'immagine approvata
-- va subito pubblicata. Non ci deve proprio essere una denominazione del genere». The states become new, published,
-- trash: approving publishes. Columns approved_at and trashed_from go (a trashed image always comes back as new).
-- An image still «approved» goes back to «new» to be approved again, because approving now also copies its game file
-- to the public bucket, which a migration cannot do (none in production when written).
-- Same rebuild as 0036: rows that dropping the old table would cascade away are copied first and put back.
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
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','published','trash')),
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
 published_at TEXT,
 trashed_at TEXT,
 analysis_status TEXT NOT NULL DEFAULT 'none' CHECK(analysis_status IN ('none','running','done','uncertain','failed')),
 analysis_error TEXT NOT NULL DEFAULT '',
 analyzed_at TEXT,
 generated_caption TEXT,
 generated_tags TEXT,
 analysis_base_context TEXT,
 analysis_task_context TEXT,
 CHECK((copy_key IS NULL) = (copy_sha256 IS NULL)),
 CHECK(status IN ('new','trash') OR copy_key IS NOT NULL)
);
INSERT INTO images_rebuilt (id,origin,status,title,description,caption,explanation,source_url,author,license_name,
 license_url,prompt,model,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,copy_width,copy_height,
 copy_bytes,rights_confirmed,revision,created_at,updated_at,published_at,trashed_at,analysis_status,analysis_error,
 analyzed_at,generated_caption,generated_tags,analysis_base_context,analysis_task_context)
SELECT id,origin,CASE status WHEN 'approved' THEN 'new' ELSE status END,title,description,caption,explanation,source_url,author,license_name,
 license_url,prompt,model,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,copy_width,copy_height,
 copy_bytes,rights_confirmed,revision,created_at,updated_at,published_at,trashed_at,analysis_status,analysis_error,
 analyzed_at,generated_caption,generated_tags,analysis_base_context,analysis_task_context FROM images;
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
