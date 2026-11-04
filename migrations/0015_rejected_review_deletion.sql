-- Explicit deletion is limited to rejected review images. Preserve judgments
-- independently from their former image row, and retain only a minimal deletion
-- register so archived sources and offline imports cannot resurrect a deletion.
CREATE TABLE editorial_review_deleted_images (
 image_id TEXT PRIMARY KEY,
 origin TEXT NOT NULL CHECK(origin IN ('REAL','AI')),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 revision INTEGER NOT NULL,
 deleted_by TEXT NOT NULL,
 deleted_at TEXT NOT NULL,
 UNIQUE(origin,sha256)
);
CREATE TRIGGER review_deletion_requires_rejected BEFORE INSERT ON editorial_review_deleted_images
 WHEN NOT EXISTS(SELECT 1 FROM editorial_review_inbox i WHERE i.id=NEW.image_id
   AND i.origin=NEW.origin AND i.sha256=NEW.sha256 AND i.revision=NEW.revision AND i.status='rejected')
 BEGIN SELECT RAISE(ABORT,'Only the current rejected image can be deleted'); END;
CREATE TRIGGER review_deletion_no_update BEFORE UPDATE ON editorial_review_deleted_images
 BEGIN SELECT RAISE(ABORT,'Deletion register is immutable'); END;
CREATE TRIGGER review_deletion_no_delete BEFORE DELETE ON editorial_review_deleted_images
 BEGIN SELECT RAISE(ABORT,'Deletion register prevents reimport'); END;
CREATE TRIGGER review_inbox_prevent_reimport BEFORE INSERT ON editorial_review_inbox
 WHEN EXISTS(SELECT 1 FROM editorial_review_deleted_images d WHERE d.image_id=NEW.id OR (d.origin=NEW.origin AND d.sha256=NEW.sha256))
 BEGIN SELECT RAISE(IGNORE); END;

-- The existing FK required retaining an image forever. Rebuild only the event
-- table, preserving every event verbatim. Judgments keep their image ID/hash.
CREATE TABLE editorial_review_inbox_events_preserved (
 id TEXT PRIMARY KEY,
 image_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 reviewer TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('pending','approved','rejected')),
 image_sha256 TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(image_id,revision)
);
INSERT INTO editorial_review_inbox_events_preserved SELECT * FROM editorial_review_inbox_events;
DROP TABLE editorial_review_inbox_events;
ALTER TABLE editorial_review_inbox_events_preserved RENAME TO editorial_review_inbox_events;
CREATE TRIGGER review_inbox_event_no_update BEFORE UPDATE ON editorial_review_inbox_events
 BEGIN SELECT RAISE(ABORT,'Review history is immutable'); END;
CREATE TRIGGER review_inbox_event_no_delete BEFORE DELETE ON editorial_review_inbox_events
 BEGIN SELECT RAISE(ABORT,'Review history must be retained'); END;
DROP TRIGGER review_inbox_no_delete;
CREATE TRIGGER review_inbox_no_delete BEFORE DELETE ON editorial_review_inbox
 WHEN OLD.status<>'rejected' OR NOT EXISTS(SELECT 1 FROM editorial_review_deleted_images d
   WHERE d.image_id=OLD.id AND d.origin=OLD.origin AND d.sha256=OLD.sha256 AND d.revision=OLD.revision)
 BEGIN SELECT RAISE(ABORT,'Explicit deletion of a rejected image required'); END;
