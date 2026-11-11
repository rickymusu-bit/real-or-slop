-- v1.0.0, 2026-11-11T05:40:53Z: docs/wizard-slop.v1.4.0.md, sections 5–7 and 9. Additive.
-- A group of SLOP being generated: theme, slots and prompts stay in D1, so that prompts already paid for survive a closed
-- tab. Each generated image records its group, its slot (index, theme and tags by category) and the quality asked.
CREATE TABLE slop_batches (
 id TEXT PRIMARY KEY,
 theme TEXT NOT NULL,
 slots TEXT NOT NULL,
 prompts TEXT NOT NULL DEFAULT '[]',
 prompts_status TEXT NOT NULL DEFAULT 'none' CHECK(prompts_status IN ('none','running','done','uncertain','failed')),
 prompts_error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX slop_batches_updated ON slop_batches(updated_at);
ALTER TABLE images ADD COLUMN generation_batch TEXT;
ALTER TABLE images ADD COLUMN generation_slot TEXT;
ALTER TABLE images ADD COLUMN generation_quality TEXT;
CREATE INDEX images_generation_batch ON images(generation_batch);
