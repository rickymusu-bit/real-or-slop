-- 2026-11-15T09:00:00Z: spec `generazione-slop` 3.0.0 (owner decision of 2026-11-14). A SLOP is the twin of one REAL: the REAL its
-- prompt was written from. Additive. The SLOP generated before have no source and are nobody's twin. The Settings key
-- «slop_group_min_real» and the columns «generation_group» and «group_key» of migration 0048 stay, unused.
ALTER TABLE images ADD COLUMN generation_source TEXT;
CREATE INDEX images_generation_source ON images(generation_source) WHERE generation_source IS NOT NULL;
