-- v1.0.0, 2026-11-07: private description proposals; no existing rows or gates changed.
CREATE TABLE editorial_topic_description_drafts (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 normalized_key TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('preparing','ready','approved','cancelled','superseded','failed','uncertain')),
 description TEXT,
 ambiguity TEXT,
 proposal_sha256 TEXT,
 successor_id TEXT,
 topic_id TEXT REFERENCES editorial_workspace_topics(id),
 approved_description TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX editorial_topic_description_active
 ON editorial_topic_description_drafts(normalized_key) WHERE status IN ('preparing','ready','uncertain');
-- Separate audited jobs allow a new operation without rebuilding the historical jobs table.
CREATE TABLE editorial_topic_description_jobs (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind='describe'),
 topic_id TEXT REFERENCES editorial_workspace_topics(id),
 operation_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('prepared','submitting','completed','uncertain','failed')),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
