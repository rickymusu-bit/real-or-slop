-- Per-gallery closed category lists for balancing (draft from the model, version approved by the owner),
-- and the blind observation of accepted SLOP made with the REAL annotator. No existing data is changed.
CREATE TABLE pipeline_taxonomies (
 gallery_id TEXT PRIMARY KEY REFERENCES galleries(id) ON DELETE CASCADE,
 taxonomy TEXT,
 draft TEXT,
 version INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
ALTER TABLE images ADD COLUMN pipeline_observed TEXT;
