-- Topic Discovery: manual, owner-only opt-in. Default OFF, no model or embeddings calls.
-- Version 1.0.0; added 2026-11-07. Additive and independent of image ingestion.
CREATE TABLE editorial_topic_discovery_settings (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO editorial_topic_discovery_settings(singleton_id,enabled,updated_at)
VALUES (1,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
