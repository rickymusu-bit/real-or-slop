-- Model contexts (spec libreria-immagini, section 7; generazione-slop, section 4). Two changes, both on model_contexts only:
-- 1. a fourth editable part, «slop_evaluation», for the evaluator of the SLOP loop (until 1.27.0 its text was fixed in the code);
-- 2. «pipeline», the SLOP pipeline a version was saved for. Versions saved before the 1.27.0 release (deployed 2026-11-15T15:10:12Z)
--    were written for the twin SLOP prompts and become 1: the Worker sends no brief call while the current «slop_prompt» is one of
--    them, until the owner saves the proposal or a text of their own. Restoring a version keeps its pipeline.
-- The CHECK on part requires rebuilding the table; ids, texts and dates are kept, in the same order.
CREATE TABLE model_contexts_0051 (
 id TEXT PRIMARY KEY,
 part TEXT NOT NULL CHECK(part IN ('base','analysis','slop_prompt','slop_evaluation')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL,
 pipeline INTEGER NOT NULL DEFAULT 2 CHECK(pipeline IN (1,2))
);
INSERT INTO model_contexts_0051(id,part,body,created_at,pipeline)
 SELECT id,part,body,created_at,CASE WHEN created_at>='2026-11-15T15:10:12Z' THEN 2 ELSE 1 END FROM model_contexts ORDER BY created_at,rowid;
DROP TABLE model_contexts;
ALTER TABLE model_contexts_0051 RENAME TO model_contexts;
CREATE INDEX model_contexts_part ON model_contexts(part, created_at);
