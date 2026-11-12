-- v1.0.0, 2026-11-12T09:00:00Z: docs/gioco-a-livelli.v1.0.0.md. Owner decisions of 2026-11-11 and 2026-11-12.
-- One game mode with four levels (photos and seconds per photo written in the code), a leaderboard with nickname and level, a
-- game code whose hash only is stored. PvP is removed: its tables go, and with them «players», used only by PvP.
-- SQLite cannot change a CHECK in place: «game_sessions» is rebuilt (mode «levels», level, seconds per photo from 1 to 120,
-- no player) and «media_events» is rebuilt without the PvP column. Dropping the old tables runs their ON DELETE CASCADE
-- actions (game_rounds, answers, media_events): those rows are copied first and put back, as in migration 0036.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE keep_game_rounds AS SELECT * FROM game_rounds;
CREATE TABLE keep_answers AS SELECT * FROM answers;
CREATE TABLE keep_media_events AS SELECT id,session_id,kind,reason,created_at FROM media_events WHERE session_id IS NOT NULL;

CREATE TABLE game_sessions_rebuilt (id TEXT PRIMARY KEY,
 mode TEXT NOT NULL CHECK(mode IN ('training','timed','levels')), created_at INTEGER NOT NULL, expires_at INTEGER,
 completed INTEGER NOT NULL DEFAULT 0, owner_hash TEXT NOT NULL,
 protocol_version INTEGER NOT NULL DEFAULT 2 CHECK(protocol_version IN (1,2)),
 phase TEXT NOT NULL DEFAULT 'active' CHECK(phase IN ('preparing','active','completed','invalidated')),
 duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds IN (60,120,180)),
 started_at INTEGER, preparation_expires_at INTEGER, invalid_reason TEXT,
 timing_mode TEXT NOT NULL DEFAULT 'per-image' CHECK(timing_mode IN ('legacy','unlimited','per-image')),
 round_seconds INTEGER CHECK(round_seconds IS NULL OR round_seconds BETWEEN 1 AND 120),
 level TEXT CHECK(level IS NULL OR level IN ('facile','medio','difficile','esperto')),
 CHECK(mode <> 'levels' OR level IS NOT NULL));
INSERT INTO game_sessions_rebuilt (id,mode,created_at,expires_at,completed,owner_hash,protocol_version,phase,duration_seconds,
 started_at,preparation_expires_at,invalid_reason,timing_mode,round_seconds)
 SELECT id,mode,created_at,expires_at,completed,owner_hash,protocol_version,phase,duration_seconds,started_at,preparation_expires_at,
 invalid_reason,timing_mode,round_seconds FROM game_sessions;
DROP TABLE game_sessions;
ALTER TABLE game_sessions_rebuilt RENAME TO game_sessions;
CREATE INDEX game_sessions_phase ON game_sessions(phase, created_at);

DROP TABLE media_events;
CREATE TABLE media_events (id TEXT PRIMARY KEY NOT NULL,
 session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('started','invalidated','preparation_expired','abandoned','load_failed')),
 reason TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX media_session_events ON media_events(session_id,created_at);

INSERT OR IGNORE INTO game_rounds SELECT * FROM keep_game_rounds;
INSERT OR IGNORE INTO answers SELECT * FROM keep_answers;
INSERT OR IGNORE INTO media_events SELECT * FROM keep_media_events;
DROP TABLE keep_game_rounds;
DROP TABLE keep_answers;
DROP TABLE keep_media_events;

-- PvP removed (owner decision of 2026-11-11).
DROP TABLE IF EXISTS challenge_images;
DROP TABLE IF EXISTS challenge_answers;
DROP TABLE IF EXISTS challenge_players;
DROP TABLE IF EXISTS challenges;
DROP TABLE IF EXISTS players;

-- Leaderboard: one row per finished game entered by its player. The code is shown once on the player's device; only its SHA-256
-- is kept, so that the owner can check a code someone shows without the database revealing any code. owner_hash is the hash of
-- the anonymous game cookie: the leaderboard shows the best entry of each player.
CREATE TABLE leaderboard (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL UNIQUE,
 owner_hash TEXT NOT NULL,
 nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 3 AND 20),
 level TEXT NOT NULL CHECK(level IN ('facile','medio','difficile','esperto')),
 score REAL NOT NULL,
 photos INTEGER NOT NULL CHECK(photos > 0),
 balanced_accuracy REAL NOT NULL CHECK(balanced_accuracy BETWEEN 0 AND 1),
 code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash) = 64),
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
 created_at TEXT NOT NULL
);
CREATE INDEX leaderboard_rank ON leaderboard(hidden, score DESC, created_at);
CREATE INDEX leaderboard_owner ON leaderboard(owner_hash);
