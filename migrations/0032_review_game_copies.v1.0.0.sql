-- v1.0.0, 2026-11-09T12:00:00Z: uniform WebP game copies reviewed by the owner (docs/copie-di-gioco.v2.0.0.md).
-- Additive: one new table, the effective-images view recreated with the same columns.
-- The copy is made in the owner's browser from the file under review, before the visual decision.
-- It becomes the file shown, voted, admitted and served to players; the original stays in quarantine
-- with its hash. One copy per inbox file (inbox id + source hash), immutable.
CREATE TABLE editorial_review_game_copies (
 inbox_id TEXT NOT NULL,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 media_key TEXT NOT NULL UNIQUE,
 mime TEXT NOT NULL CHECK(mime='image/webp'),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 2048),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 2048),
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 4000000),
 recipe TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(inbox_id,source_sha256)
);
CREATE TRIGGER review_game_copy_current_source BEFORE INSERT ON editorial_review_game_copies
 WHEN NOT EXISTS(SELECT 1 FROM editorial_review_inbox WHERE id=NEW.inbox_id AND sha256=NEW.source_sha256 AND status<>'rejected')
 BEGIN SELECT RAISE(ABORT,'Game copy must derive from the current, not rejected, inbox file'); END;
CREATE TRIGGER review_game_copy_no_update BEFORE UPDATE ON editorial_review_game_copies
 BEGIN SELECT RAISE(ABORT,'Game copies are immutable'); END;
CREATE TRIGGER review_game_copy_no_delete BEFORE DELETE ON editorial_review_game_copies
 BEGIN SELECT RAISE(ABORT,'Game copies are immutable'); END;

-- Same columns as 0016. A legacy 1024 presentation keeps precedence (explicit post-approval normalization);
-- otherwise the game copy is the effective file.
DROP VIEW editorial_review_effective_images;
CREATE VIEW editorial_review_effective_images AS
 SELECT i.id,i.origin,COALESCE(p.sha256,g.sha256,i.sha256) AS sha256,
   COALESCE(p.media_key,g.media_key,i.media_key) AS media_key,
   CASE WHEN p.image_id IS NOT NULL THEN json_set(i.metadata_json,
     '$.profile',json_extract(p.metadata_json,'$.profile'),
     '$.profile_image_sha256',p.sha256,
     '$.presentation',json_extract(p.metadata_json,'$.presentation'),
     '$.normalization',json_extract(p.metadata_json,'$.normalization'))
   WHEN g.inbox_id IS NOT NULL THEN json_set(i.metadata_json,'$.game_copy',json_object('sha256',g.sha256,
     'width',g.width,'height',g.height,'bytes',g.bytes,'recipe',g.recipe,'source_sha256',g.source_sha256))
   ELSE i.metadata_json END AS metadata_json,
   i.pair_key,i.status,i.revision,i.created_at,i.sha256 AS source_sha256
 FROM editorial_review_inbox i
 LEFT JOIN editorial_review_presentations p ON p.image_id=i.id AND p.source_sha256=i.sha256
 LEFT JOIN editorial_review_game_copies g ON g.inbox_id=i.id AND g.source_sha256=i.sha256;
