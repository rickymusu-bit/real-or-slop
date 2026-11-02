-- Private generation files, including discarded outputs. Existing records unchanged.
CREATE TABLE editorial_attempt_media (
 attempt_id TEXT NOT NULL REFERENCES editorial_attempts(id),
 kind TEXT NOT NULL CHECK(kind IN ('original','preview')),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 12000000),
 r2_key TEXT NOT NULL UNIQUE,
 archived_at TEXT NOT NULL,
 PRIMARY KEY(attempt_id,kind)
);
CREATE TRIGGER attempt_media_immutable BEFORE UPDATE ON editorial_attempt_media
BEGIN SELECT RAISE(ABORT,'Attempt media archive is immutable'); END;
CREATE TRIGGER attempt_media_no_delete BEFORE DELETE ON editorial_attempt_media
BEGIN SELECT RAISE(ABORT,'Attempt media archive is immutable'); END;
