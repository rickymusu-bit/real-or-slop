-- v1.0.0, 2026-11-10T09:39:49Z: docs/libreria-immagini.v1.6.0.md, section 12. Additive.
-- Owner decision of 2026-11-10: the fixed context of the language model is edited from the dashboard Settings.
-- Three parts: «base» (sent with every call), «analysis» (tags and captions), «slop_prompt» (prompts for the image
-- generator, phase 3). Every save is a new version; the current one is the latest. The first versions are written by
-- the Worker on first use, from the texts approved by the owner. Each generation records the versions it used.
CREATE TABLE model_contexts (
 id TEXT PRIMARY KEY,
 part TEXT NOT NULL CHECK(part IN ('base','analysis','slop_prompt')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL
);
CREATE INDEX model_contexts_part ON model_contexts(part, created_at);
ALTER TABLE images ADD COLUMN analysis_base_context TEXT;
ALTER TABLE images ADD COLUMN analysis_task_context TEXT;
