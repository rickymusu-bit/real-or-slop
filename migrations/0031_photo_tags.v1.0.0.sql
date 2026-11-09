-- v1.0.0, 2026-11-09T05:00:00Z: per-photo tags, phase 2a of docs/lotti-editoriali.v1.4.2.md (section 4).
-- Additive only. The `untagged` placeholder is derived (a photo without active tags) and never stored.
-- Tags follow the photo identity (inbox id) through approval, admission and publication; every change
-- is an append-only event carrying the pixel hash seen at that moment.
CREATE TABLE editorial_tags (
 id TEXT PRIMARY KEY,
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 40 AND label=lower(label) AND instr(label,' ')=0 AND label<>'untagged'),
 source TEXT NOT NULL CHECK(source IN ('owner','model')),
 created_at TEXT NOT NULL,
 retired_at TEXT
);
CREATE UNIQUE INDEX editorial_tags_active_label ON editorial_tags(label) WHERE retired_at IS NULL;
CREATE TRIGGER editorial_tags_identity BEFORE UPDATE OF id,label,source,created_at ON editorial_tags
 BEGIN SELECT RAISE(ABORT,'Tag identity is immutable'); END;
CREATE TRIGGER editorial_tags_retire_once BEFORE UPDATE OF retired_at ON editorial_tags
 WHEN OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
 BEGIN SELECT RAISE(ABORT,'A tag is retired once and never restored'); END;
CREATE TRIGGER editorial_tags_no_delete BEFORE DELETE ON editorial_tags
 BEGIN SELECT RAISE(ABORT,'Tags are retired, not deleted'); END;
-- Current state: one row per active photo-tag pair.
CREATE TABLE editorial_image_tags (
 inbox_id TEXT NOT NULL,
 tag_id TEXT NOT NULL REFERENCES editorial_tags(id),
 source TEXT NOT NULL CHECK(source IN ('owner','model')),
 added_at TEXT NOT NULL,
 PRIMARY KEY(inbox_id,tag_id)
);
CREATE INDEX editorial_image_tags_tag ON editorial_image_tags(tag_id);
CREATE TRIGGER editorial_image_tags_active_only BEFORE INSERT ON editorial_image_tags
 WHEN EXISTS(SELECT 1 FROM editorial_tags WHERE id=NEW.tag_id AND retired_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'Retired tags cannot be assigned'); END;
CREATE TABLE editorial_image_tag_events (
 id TEXT PRIMARY KEY,
 inbox_id TEXT NOT NULL,
 tag_id TEXT NOT NULL REFERENCES editorial_tags(id),
 action TEXT NOT NULL CHECK(action IN ('add','remove')),
 image_sha256 TEXT,
 source TEXT NOT NULL CHECK(source IN ('owner','model','retirement')),
 created_at TEXT NOT NULL
);
CREATE INDEX editorial_image_tag_events_image ON editorial_image_tag_events(inbox_id,created_at);
CREATE TRIGGER editorial_image_tag_events_no_update BEFORE UPDATE ON editorial_image_tag_events
 BEGIN SELECT RAISE(ABORT,'Tag history is immutable'); END;
CREATE TRIGGER editorial_image_tag_events_no_delete BEFORE DELETE ON editorial_image_tag_events
 BEGIN SELECT RAISE(ABORT,'Tag history is immutable'); END;
