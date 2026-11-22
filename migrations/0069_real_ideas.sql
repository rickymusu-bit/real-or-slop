-- Owner decisions of 2026-11-21: the ways of making a SLOP from a REAL are a property of the REAL. A model proposes up to three ideas
-- per REAL (a paid, confirmed call), the owner approves them, and the automatic extraction draws only REAL with an approved idea that
-- is free. Each idea yields at most one SLOP: it is marked as used when its SLOP is accepted. The temporary link between the REAL and
-- its process therefore lasts until the process ends (accepted or closed), no longer until the second confirmation.
CREATE TABLE real_ideas (
 id TEXT PRIMARY KEY,
 image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
 -- Gallery and revision of its instructions when the idea was written or last approved: a different one means «to review».
 gallery_id TEXT NOT NULL,
 gallery_revision INTEGER NOT NULL,
 idea TEXT NOT NULL CHECK(length(idea) BETWEEN 1 AND 600),
 genre TEXT NOT NULL CHECK(length(genre) <= 160),
 changes TEXT NOT NULL CHECK(length(changes) <= 400),
 status TEXT NOT NULL CHECK(status IN ('proposed','approved','used')),
 model TEXT NOT NULL,
 base_context TEXT NOT NULL,
 ideas_context TEXT NOT NULL,
 created_at TEXT NOT NULL,
 approved_at TEXT,
 used_at TEXT
);
CREATE INDEX real_ideas_image ON real_ideas(image_id, status);
-- Why the model proposed no idea for a REAL, until ideas are proposed again.
ALTER TABLE images ADD COLUMN ideas_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE slop_gallery_sources ADD COLUMN idea_id TEXT REFERENCES real_ideas(id) ON DELETE SET NULL;

-- Leaving the proposals closes the processes that will not generate, and only their links go; the links of the confirmed processes
-- stay until the process is accepted or closed.
DROP TRIGGER slop_gallery_clear_sources;
CREATE TRIGGER slop_gallery_clear_sources AFTER UPDATE OF gallery_review ON slop_batches
 WHEN OLD.gallery_review='pending' AND NEW.gallery_review<>'pending'
BEGIN
 UPDATE slop_processes SET state='closed',updated_at=NEW.updated_at WHERE batch_id=NEW.id
   AND (NEW.gallery_review<>'confirmed' OR state<>'ready' OR premise IS NULL);
 DELETE FROM slop_gallery_sources WHERE process_id IN (SELECT id FROM slop_processes WHERE batch_id=NEW.id AND state='closed');
END;
-- A SLOP accepted, automatically or by the owner: its idea is used and the link goes.
CREATE TRIGGER slop_gallery_source_accepted AFTER UPDATE OF state ON slop_processes
 WHEN NEW.state='accepted' AND OLD.state<>'accepted'
BEGIN
 UPDATE real_ideas SET status='used',used_at=NEW.updated_at
   WHERE id=(SELECT idea_id FROM slop_gallery_sources WHERE process_id=NEW.id) AND status<>'used';
 DELETE FROM slop_gallery_sources WHERE process_id=NEW.id;
END;
-- A process closed without a SLOP: the link goes and the idea stays available.
CREATE TRIGGER slop_gallery_source_closed AFTER UPDATE OF state ON slop_processes
 WHEN NEW.state='closed' AND OLD.state<>'closed'
BEGIN
 DELETE FROM slop_gallery_sources WHERE process_id=NEW.id;
END;

-- The instructions of the ideas are a part of the model context. No foreign key points at model_contexts.
CREATE TABLE model_contexts_0069 (
 id TEXT PRIMARY KEY,
 part TEXT NOT NULL CHECK(part IN ('base','analysis','slop_prompt','slop_evaluation','slop_gallery_prompt','real_measure','real_ideas')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL,
 pipeline INTEGER NOT NULL DEFAULT 2 CHECK(pipeline IN (1,2))
);
INSERT INTO model_contexts_0069 SELECT id,part,body,created_at,pipeline FROM model_contexts ORDER BY rowid;
DROP TABLE model_contexts;
ALTER TABLE model_contexts_0069 RENAME TO model_contexts;
CREATE INDEX model_contexts_part ON model_contexts(part, created_at);
