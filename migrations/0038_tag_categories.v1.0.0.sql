-- v1.0.0, 2026-11-10T16:16:00Z: docs/categorie-tag.v1.1.0.md. Additive. One category per tag, from a fixed list; existing tags
-- become «other» (none in production when written). The rules on decades and on one Time or Format tag per image
-- are enforced by the Worker (shared/tag-categories.v1.0.0.ts).
ALTER TABLE tags ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
 CHECK(category IN ('time','format','place','setting','event','people','object','other'));
CREATE INDEX tags_category ON tags(category, label);
