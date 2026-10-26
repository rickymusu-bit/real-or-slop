-- Existing assignments/deadlines keep protocol 1. New sessions opt into 2.
ALTER TABLE game_sessions ADD COLUMN protocol_version INTEGER NOT NULL DEFAULT 1 CHECK(protocol_version IN (1,2));
ALTER TABLE game_sessions ADD COLUMN phase TEXT NOT NULL DEFAULT 'active' CHECK(phase IN ('preparing','active','completed','invalidated'));
ALTER TABLE game_sessions ADD COLUMN duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds IN (60,120,180));
ALTER TABLE game_sessions ADD COLUMN started_at INTEGER;
ALTER TABLE game_sessions ADD COLUMN preparation_expires_at INTEGER;
ALTER TABLE game_sessions ADD COLUMN invalid_reason TEXT;
UPDATE game_sessions SET phase='completed' WHERE completed=1;
ALTER TABLE challenges ADD COLUMN outcome TEXT NOT NULL DEFAULT 'active' CHECK(outcome IN ('active','completed','abandoned','invalidated'));
UPDATE challenges SET outcome='completed' WHERE completed_at IS NOT NULL;
CREATE TABLE media_events (
 id TEXT PRIMARY KEY NOT NULL,
 session_id TEXT REFERENCES game_sessions(id) ON DELETE CASCADE,
 challenge_id TEXT REFERENCES challenges(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('started','invalidated','preparation_expired','abandoned','load_failed')),
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 CHECK((session_id IS NULL) != (challenge_id IS NULL))
);
CREATE INDEX media_session_events ON media_events(session_id,created_at);
CREATE INDEX media_challenge_events ON media_events(challenge_id,created_at);
-- Invalidated games have no valid score and cannot bias editorial statistics.
DROP VIEW image_answer_statistics;
CREATE VIEW image_answer_statistics AS
 SELECT r.image_id,a.correct FROM answers a JOIN game_rounds r ON r.id=a.round_id JOIN game_sessions s ON s.id=r.session_id WHERE s.phase!='invalidated'
 UNION ALL
 SELECT a.image_id,a.correct FROM challenge_answers a JOIN challenges c ON c.id=a.challenge_id WHERE c.outcome!='invalidated';
