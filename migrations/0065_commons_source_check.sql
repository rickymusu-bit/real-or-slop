-- Owner decision, 2026-11-20: a nightly check asks Wikimedia Commons whether the file of each REAL still exists. Fifty photos a night,
-- each one only three months after its last check; a file gone from Commons is only flagged for the owner.
-- The acquisition read the file from Commons, so it counts as the first check.
ALTER TABLE images ADD COLUMN source_checked_at TEXT;
ALTER TABLE images ADD COLUMN source_missing_at TEXT;
UPDATE images SET source_checked_at=created_at WHERE origin='REAL' AND source_url LIKE 'https://commons.wikimedia.org/wiki/File:%';
CREATE INDEX images_source_check ON images(source_checked_at) WHERE origin='REAL';
