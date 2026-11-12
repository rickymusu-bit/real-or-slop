-- v1.0.0, 2026-11-12T08:00:00Z: docs/copie-di-gioco.v3.0.0.md. Additive.
-- Owner decision of 2026-11-11: every game copy is 4:5, cut from the oriented original along a frame chosen by the owner.
-- The frame is recorded as JSON {x, y, height} (width = height × 4/5). A copy made before this migration has no frame: it must
-- be made again, in 4:5, before the image can be approved or published.
ALTER TABLE images ADD COLUMN copy_crop TEXT;
