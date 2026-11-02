-- Existing sessions keep their total deadline and original answers/history.
ALTER TABLE game_sessions ADD COLUMN timing_mode TEXT NOT NULL DEFAULT 'legacy' CHECK(timing_mode IN ('legacy','unlimited','per-image'));
ALTER TABLE game_sessions ADD COLUMN round_seconds INTEGER CHECK(round_seconds IS NULL OR round_seconds IN (10,20,30));
ALTER TABLE game_rounds ADD COLUMN expires_at INTEGER;
-- A timeout is an unanswered round, never a fabricated REAL/AI answer.
ALTER TABLE game_rounds ADD COLUMN timed_out INTEGER NOT NULL DEFAULT 0 CHECK(timed_out IN (0,1));
