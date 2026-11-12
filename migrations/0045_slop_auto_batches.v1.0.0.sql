-- v1.0.0, 2026-11-12T21:00:00Z: docs/proposta-generazione-slop.v2.0.0.md. Additive for the data: no row is lost.
-- Automatic SLOP batches: a group of the studio («slop_batches», migration 0040) with origin «auto», the proposed tag, its state
-- (running, review, closed), its size, the counts at the owner's confirmation and the slots already sent to the generator, so that
-- a batch picked up again never resends a call. At most one automatic batch is open (running or review): a unique partial index.
ALTER TABLE slop_batches ADD COLUMN origin TEXT NOT NULL DEFAULT 'studio' CHECK(origin IN ('studio','auto'));
ALTER TABLE slop_batches ADD COLUMN auto_tag TEXT;
ALTER TABLE slop_batches ADD COLUMN auto_status TEXT CHECK(auto_status IS NULL OR auto_status IN ('running','review','closed'));
ALTER TABLE slop_batches ADD COLUMN auto_size INTEGER;
ALTER TABLE slop_batches ADD COLUMN auto_snapshot TEXT;
ALTER TABLE slop_batches ADD COLUMN auto_attempted TEXT NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX slop_batches_one_open_auto ON slop_batches(origin) WHERE origin='auto' AND auto_status IN ('running','review');

-- Tags whose proposal the owner ignored, with the spread percentage of that moment: the tag comes back after 10 more points.
CREATE TABLE slop_proposal_ignored (
 tag TEXT PRIMARY KEY,
 spread_percent REAL NOT NULL,
 created_at TEXT NOT NULL
);

-- Two new Settings keys (proposals on or off, proposal threshold in percent): the CHECK on the keys of «app_settings» is rebuilt,
-- keeping every stored value.
CREATE TABLE app_settings_0045 (
 key TEXT PRIMARY KEY CHECK(key IN ('image_quality','slop_section_min_real','slop_theme_min_real','open_game_hours',
  'slop_auto_enabled','slop_auto_threshold_percent')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 40),
 updated_at TEXT NOT NULL
);
INSERT INTO app_settings_0045(key,value,updated_at) SELECT key,value,updated_at FROM app_settings;
DROP TABLE app_settings;
ALTER TABLE app_settings_0045 RENAME TO app_settings;
