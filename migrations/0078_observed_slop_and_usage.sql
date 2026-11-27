-- Private observations of accepted SLOP and an anonymous lifetime count on each REAL.
-- No source identity is retained on SLOP; old uses cannot be reconstructed.
ALTER TABLE images ADD COLUMN pipeline_slop_observation TEXT;
ALTER TABLE images ADD COLUMN slop_generated_count INTEGER NOT NULL DEFAULT 0 CHECK(slop_generated_count>=0);
-- Claim the counter in the same transaction that records the first successfully stored candidate.
ALTER TABLE pipeline_jobs ADD COLUMN generation_counted INTEGER NOT NULL DEFAULT 0 CHECK(generation_counted IN (0,1));
