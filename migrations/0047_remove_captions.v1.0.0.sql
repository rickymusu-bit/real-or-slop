-- v1.0.0, 2026-11-13T22:00:00Z: docs/didascalie-wizard.v1.0.0.md. Owner decision of 2026-11-13: captions are removed everywhere and
-- the ones already written are deleted («Ovunque e cancellate»). The columns stay (dropping them would rebuild the images table for
-- nothing); every caption is emptied, the generated captions and the captions kept by game rounds are cleared. Not reversible.
UPDATE images SET caption='' WHERE caption<>'';
UPDATE images SET generated_caption=NULL WHERE generated_caption IS NOT NULL;
UPDATE game_rounds SET caption=NULL WHERE caption IS NOT NULL;
