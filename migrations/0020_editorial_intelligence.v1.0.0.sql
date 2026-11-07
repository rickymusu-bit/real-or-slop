-- v1.0.0 - Admin workspace intelligence. Additive; no automatic import, publication or paid calls.
CREATE TABLE editorial_workspace_acquisitions (
 proposal_id TEXT PRIMARY KEY REFERENCES editorial_workspace_proposals(id),
 inbox_id TEXT NOT NULL UNIQUE REFERENCES editorial_review_inbox(id),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 created_at TEXT NOT NULL
);
CREATE TABLE editorial_topic_suggestions (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 normalized_key TEXT NOT NULL UNIQUE,
 rationale TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','accepted','rejected','deferred')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE editorial_topic_explorations (
 id TEXT PRIMARY KEY,
 topic_id TEXT NOT NULL REFERENCES editorial_workspace_topics(id),
 query TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('commons','manual')),
 status TEXT NOT NULL CHECK(status IN ('planned','completed','failed','uncertain')),
 candidates INTEGER NOT NULL DEFAULT 0 CHECK(candidates BETWEEN 0 AND 10),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX editorial_topic_explorations_topic ON editorial_topic_explorations(topic_id,created_at);
CREATE TABLE editorial_image_profiles (
 inbox_id TEXT NOT NULL,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 origin TEXT NOT NULL CHECK(origin IN ('REAL','AI')),
 profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
 model TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(inbox_id,sha256)
);
CREATE TABLE editorial_topic_slop_seed (
 topic_id TEXT PRIMARY KEY REFERENCES editorial_workspace_topics(id),
 seed_json TEXT NOT NULL CHECK(json_valid(seed_json)),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 created_at TEXT NOT NULL
);
CREATE TABLE editorial_slop_prompt_bank (
 id TEXT PRIMARY KEY,
 topic_id TEXT NOT NULL REFERENCES editorial_workspace_topics(id),
 slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 31),
 prompt TEXT NOT NULL CHECK(length(prompt) BETWEEN 30 AND 4000),
 variant TEXT NOT NULL CHECK(variant IN ('landscape','portrait','square')),
 model TEXT NOT NULL,
 frozen_sha256 TEXT NOT NULL CHECK(length(frozen_sha256)=64),
 created_at TEXT NOT NULL,
 UNIQUE(topic_id,slot)
);
CREATE TABLE editorial_workspace_jobs (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('suggest','search','profile','slop_plan','slop_generate')),
 topic_id TEXT REFERENCES editorial_workspace_topics(id),
 operation_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('prepared','submitting','completed','uncertain','failed')),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX editorial_workspace_jobs_topic ON editorial_workspace_jobs(topic_id,created_at);
