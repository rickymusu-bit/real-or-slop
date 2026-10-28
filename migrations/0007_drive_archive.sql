-- Private provenance of originals retained in Google Drive.
-- The public image/media API must never expose these file identifiers.
CREATE TABLE image_archives (
  image_id TEXT PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL UNIQUE,
  drive_manifest_id TEXT NOT NULL,
  original_sha256 TEXT NOT NULL CHECK(length(original_sha256) = 64),
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX image_archives_manifest ON image_archives(drive_manifest_id);
