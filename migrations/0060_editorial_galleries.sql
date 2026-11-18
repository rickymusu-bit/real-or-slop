-- Editorial galleries and temporary selections. Existing catalogue and batch records keep their contract.
CREATE TABLE galleries (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 description TEXT NOT NULL DEFAULT '',
 slop_instructions TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE images ADD COLUMN gallery_id TEXT REFERENCES galleries(id);
CREATE INDEX images_gallery ON images(gallery_id,origin,status);
ALTER TABLE slop_batches ADD COLUMN gallery_id TEXT REFERENCES galleries(id);
ALTER TABLE slop_batches ADD COLUMN gallery_review TEXT;
ALTER TABLE slop_batches ADD COLUMN gallery_expires INTEGER;
ALTER TABLE slop_processes ADD COLUMN premise TEXT;
CREATE TABLE slop_gallery_sources (
 process_id TEXT PRIMARY KEY REFERENCES slop_processes(id) ON DELETE CASCADE,
 source_id TEXT NOT NULL,
 revision INTEGER NOT NULL
);

-- Keep historical instruction versions and their IDs. Gallery prompts have their own compatible text.
CREATE TABLE model_contexts_0060 (
 id TEXT PRIMARY KEY,
 part TEXT NOT NULL CHECK(part IN ('base','analysis','slop_prompt','slop_evaluation','slop_gallery_prompt')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL,
 pipeline INTEGER NOT NULL DEFAULT 2 CHECK(pipeline IN (1,2))
);
INSERT INTO model_contexts_0060 SELECT * FROM model_contexts ORDER BY rowid;
DROP TABLE model_contexts;
ALTER TABLE model_contexts_0060 RENAME TO model_contexts;
CREATE INDEX model_contexts_part ON model_contexts(part, created_at);

CREATE TRIGGER slop_gallery_clear_sources AFTER UPDATE OF gallery_review ON slop_batches
 WHEN OLD.gallery_review='pending' AND NEW.gallery_review<>'pending'
BEGIN
 UPDATE slop_processes SET state='closed',updated_at=NEW.updated_at WHERE batch_id=NEW.id
   AND (NEW.gallery_review<>'confirmed' OR state<>'ready' OR premise IS NULL);
 DELETE FROM slop_gallery_sources WHERE process_id IN (SELECT id FROM slop_processes WHERE batch_id=NEW.id);
END;
