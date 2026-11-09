-- v1.1.0, 2026-11-09T21:30:00Z: phase 2 of docs/libreria-immagini.v1.3.0.md. Additive. Replaces v1.0.0 of the same
-- migration, never applied remotely. Tag aliases, automatic removal of tags left without images, image analysis state,
-- a register of paid API calls and one total budget for all of them.

-- An alias is an alternative label that always resolves to one tag; it is never attached to an image.
CREATE TABLE tag_aliases (
 alias TEXT PRIMARY KEY CHECK(length(alias) BETWEEN 1 AND 40 AND alias NOT GLOB '*[^a-z0-9-]*'
   AND alias NOT GLOB '-*' AND alias NOT GLOB '*-' AND alias NOT GLOB '*--*'),
 tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL
);
CREATE INDEX tag_aliases_tag ON tag_aliases(tag_id);
CREATE TRIGGER tag_alias_not_a_tag BEFORE INSERT ON tag_aliases
 WHEN EXISTS(SELECT 1 FROM tags WHERE label=NEW.alias)
 BEGIN SELECT RAISE(ABORT,'An alias cannot also be a tag'); END;
CREATE TRIGGER tag_not_an_alias BEFORE INSERT ON tags
 WHEN EXISTS(SELECT 1 FROM tag_aliases WHERE alias=NEW.label)
 BEGIN SELECT RAISE(ABORT,'A tag cannot also be an alias'); END;
-- A tag disappears with its last image (its aliases with it): the vocabulary holds only tags in use.
CREATE TRIGGER tag_removed_with_last_image AFTER DELETE ON image_tags
 WHEN NOT EXISTS(SELECT 1 FROM image_tags WHERE tag_id=OLD.tag_id)
 BEGIN DELETE FROM tags WHERE id=OLD.tag_id; END;

-- Analysis by the vision model (tags and caption): one call at a time per image, never resent automatically.
ALTER TABLE images ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'none'
 CHECK(analysis_status IN ('none','running','done','uncertain','failed'));
ALTER TABLE images ADD COLUMN analysis_error TEXT NOT NULL DEFAULT '';
ALTER TABLE images ADD COLUMN analyzed_at TEXT;

-- Paid API calls. Money spent stays recorded; no link to images, which leave no records when deleted.
-- reserved_usd: maximum cost held before the call; cost_usd: cost from the tokens reported, once known.
CREATE TABLE spend (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('analysis','generation')),
 model TEXT NOT NULL,
 reserved_usd REAL NOT NULL CHECK(reserved_usd > 0),
 cost_usd REAL CHECK(cost_usd >= 0),
 status TEXT NOT NULL CHECK(status IN ('reserved','completed','uncertain','failed')),
 input_tokens INTEGER,
 output_tokens INTEGER,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX spend_period ON spend(created_at, status);

-- One budget for every paid call. The owner changes the cap or renews it: a renewal starts a new period from
-- «since», and the register keeps every call.
CREATE TABLE budget (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 cap_usd REAL NOT NULL CHECK(cap_usd > 0),
 since TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
INSERT INTO budget(id, cap_usd, since, updated_at)
 VALUES(1, 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
