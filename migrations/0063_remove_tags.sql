-- Owner decision, 2026-11-20: photos have no tags. The gallery groups them, black and white, sepia or colour of a SLOP follow the
-- measures of its source REAL, and the analysis of a REAL returns only its editorial description.
-- Images, copies, descriptions, analysis state, processes, calls and games are kept; only tags, aliases and their fields go.
-- Children first: dropping a parent with foreign keys on would delete their rows one by one through the cascade.
DROP TRIGGER IF EXISTS tag_removed_with_last_image;
DROP TRIGGER IF EXISTS tag_alias_not_a_tag;
DROP TRIGGER IF EXISTS tag_not_an_alias;
DROP TABLE image_tags;
DROP TABLE tag_aliases;
DROP TABLE tags;
ALTER TABLE images DROP COLUMN generated_tags;
ALTER TABLE images DROP COLUMN categories_completed_at;
