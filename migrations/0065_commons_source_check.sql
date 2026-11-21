-- Owner decision, 2026-11-20: a nightly check asks Wikimedia Commons whether the file of each REAL still exists. Fifty photos a night by default,
-- each one only three months after its last check; a file gone from Commons is only flagged for the owner.
-- The acquisition read the file from Commons, so it counts as the first check.
ALTER TABLE images ADD COLUMN source_checked_at TEXT;
ALTER TABLE images ADD COLUMN source_missing_at TEXT;
UPDATE images SET source_checked_at=created_at WHERE origin='REAL' AND source_url LIKE 'https://commons.wikimedia.org/wiki/File:%';
CREATE INDEX images_source_check ON images(source_checked_at) WHERE origin='REAL';
-- The number of REAL checked each night is a setting of the dashboard (owner request of 2026-11-20): the table of the settings
-- accepts its key. No foreign key points at app_settings, so the table is rebuilt with every row.
CREATE TABLE app_settings_0065 (
 key TEXT PRIMARY KEY CHECK(key IN ('image_quality','open_game_hours','max_generation_attempts','editorial_tolerance','commons_checks_per_night')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 40), updated_at TEXT NOT NULL
);
INSERT INTO app_settings_0065 SELECT key,value,updated_at FROM app_settings;
DROP TABLE app_settings;
ALTER TABLE app_settings_0065 RENAME TO app_settings;
