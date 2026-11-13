-- v1.0.0, 2026-11-13T10:00:00Z: docs/copie-di-gioco.v4.0.0.md. Additive: no row is lost.
-- Owner decisions of 2026-11-13: the game copy is the photo cropped to the nearest common format (the format is recorded in
-- copy_crop, which gains «width» and «format»); copy_view is the 4:5 view a vertical screen shows first, as JSON {x, y, height}
-- in pixels of the copy. A round keeps the view it serves, as fractions of its copy, like its caption and copy (migration 0041).
-- A 4:5 copy made before this migration has no format and no view: it stays playable, shown whole, until the owner makes it again.
ALTER TABLE images ADD COLUMN copy_view TEXT;
ALTER TABLE game_rounds ADD COLUMN copy_view TEXT;
