-- A private, image-level editorial inbox. Previous decisions and source archives
-- remain intact; inclusion and visual approval do not confer publication rights.
CREATE TABLE editorial_review_inbox (
 id TEXT PRIMARY KEY,
 origin TEXT NOT NULL CHECK(origin IN ('REAL','AI')),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 media_key TEXT NOT NULL,
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 pair_key TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(origin,sha256)
);
CREATE INDEX review_inbox_pending ON editorial_review_inbox(status,created_at,id);
CREATE INDEX review_inbox_pairs ON editorial_review_inbox(pair_key,origin);
CREATE TRIGGER review_inbox_identity_immutable BEFORE UPDATE OF id,origin,sha256,media_key,metadata_json,pair_key,created_at ON editorial_review_inbox
 BEGIN SELECT RAISE(ABORT,'Review image identity is immutable'); END;
CREATE TRIGGER review_inbox_no_delete BEFORE DELETE ON editorial_review_inbox
 BEGIN SELECT RAISE(ABORT,'Review images must be retained'); END;
CREATE TABLE editorial_review_inbox_events (
 id TEXT PRIMARY KEY,
 image_id TEXT NOT NULL REFERENCES editorial_review_inbox(id),
 revision INTEGER NOT NULL,
 reviewer TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('pending','approved','rejected')),
 image_sha256 TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(image_id,revision)
);
CREATE TRIGGER review_inbox_event_no_update BEFORE UPDATE ON editorial_review_inbox_events
 BEGIN SELECT RAISE(ABORT,'Review history is immutable'); END;
CREATE TRIGGER review_inbox_event_no_delete BEFORE DELETE ON editorial_review_inbox_events
 BEGIN SELECT RAISE(ABORT,'Review history must be retained'); END;
