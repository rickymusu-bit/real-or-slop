-- Remove obsolete photo fields after captions and initial views were retired.
-- Explanation never reaches the game; descriptions and editorial context remain separate.
-- DROP COLUMN preserves image identifiers, copies, tags, rounds and mother/child allocation.
ALTER TABLE images DROP COLUMN caption;
ALTER TABLE images DROP COLUMN generated_caption;
ALTER TABLE images DROP COLUMN copy_view;
ALTER TABLE images DROP COLUMN explanation;
ALTER TABLE game_rounds DROP COLUMN caption;
ALTER TABLE game_rounds DROP COLUMN copy_view;
