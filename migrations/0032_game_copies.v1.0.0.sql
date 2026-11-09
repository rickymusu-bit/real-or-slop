-- v1.0.0, 2026-11-09T11:00:00Z: uniform WebP game copies (docs/copie-di-gioco.v1.0.0.md).
-- Additive only. The admitted file (the pixels the owner approved, identified by its hash) stays as it is;
-- the game serves a derived WebP made in the owner's browser with the same size limit and quality for
-- REAL and SLOP, so format, compression and metadata no longer reveal the origin.
-- One copy per image, immutable: it records the hash of the file it was made from.
CREATE TABLE editorial_game_copies (
 image_id TEXT PRIMARY KEY REFERENCES images(id),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 r2_key TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 mime TEXT NOT NULL CHECK(mime='image/webp'),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 2048),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 2048),
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 4000000),
 recipe TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TRIGGER editorial_game_copies_source BEFORE INSERT ON editorial_game_copies
 WHEN NOT EXISTS(SELECT 1 FROM images WHERE id=NEW.image_id AND sha256=NEW.source_sha256)
 BEGIN SELECT RAISE(ABORT,'Game copy must derive from the admitted file'); END;
CREATE TRIGGER editorial_game_copies_no_update BEFORE UPDATE ON editorial_game_copies
 BEGIN SELECT RAISE(ABORT,'Game copies are immutable'); END;
CREATE TRIGGER editorial_game_copies_no_delete BEFORE DELETE ON editorial_game_copies
 BEGIN SELECT RAISE(ABORT,'Game copies are immutable'); END;
