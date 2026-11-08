-- v1.0.0, 2026-11-08. Additive audit only; no historical votes/media changed.
CREATE TABLE editorial_preference_snapshots (
 id TEXT PRIMARY KEY CHECK(length(id)=64),
 origin TEXT NOT NULL CHECK(origin IN ('REAL','AI')),
 learner_version TEXT NOT NULL,
 observations INTEGER NOT NULL,
 approved INTEGER NOT NULL,
 rejected INTEGER NOT NULL,
 state_json TEXT NOT NULL CHECK(json_valid(state_json)),
 source_count INTEGER NOT NULL,
 source_updated_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX editorial_preference_snapshots_history ON editorial_preference_snapshots(origin,created_at,id);
CREATE TABLE editorial_preference_snapshot_chunks (
 snapshot_id TEXT NOT NULL REFERENCES editorial_preference_snapshots(id),
 kind TEXT NOT NULL CHECK(kind IN ('counts','sources')),
 slot INTEGER NOT NULL,
 items_json TEXT NOT NULL CHECK(json_valid(items_json) AND length(CAST(items_json AS BLOB))<=500000),
 PRIMARY KEY(snapshot_id,kind,slot)
);
CREATE TRIGGER editorial_preference_snapshot_chunks_no_update BEFORE UPDATE ON editorial_preference_snapshot_chunks
BEGIN SELECT RAISE(ABORT,'preference snapshot chunks are immutable'); END;
CREATE TRIGGER editorial_preference_snapshot_chunks_no_delete BEFORE DELETE ON editorial_preference_snapshot_chunks
BEGIN SELECT RAISE(ABORT,'preference snapshot chunks are immutable'); END;
CREATE TRIGGER editorial_preference_snapshots_no_update BEFORE UPDATE ON editorial_preference_snapshots
BEGIN SELECT RAISE(ABORT,'preference snapshots are immutable'); END;
CREATE TRIGGER editorial_preference_snapshots_no_delete BEFORE DELETE ON editorial_preference_snapshots
BEGIN SELECT RAISE(ABORT,'preference snapshots are immutable'); END;
CREATE TABLE editorial_image_geometry (
 inbox_id TEXT NOT NULL,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 parser_version TEXT NOT NULL,
 geometry_json TEXT NOT NULL CHECK(json_valid(geometry_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(inbox_id,sha256,parser_version)
);
CREATE TRIGGER editorial_image_geometry_no_update BEFORE UPDATE ON editorial_image_geometry
BEGIN SELECT RAISE(ABORT,'geometry audits are immutable'); END;
CREATE TRIGGER editorial_image_geometry_no_delete BEFORE DELETE ON editorial_image_geometry
BEGIN SELECT RAISE(ABORT,'geometry audits are immutable'); END;
