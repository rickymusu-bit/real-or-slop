PRAGMA foreign_keys = ON;
CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES categories(id));
CREATE TABLE sources (id TEXT PRIMARY KEY, provider TEXT NOT NULL, source_id TEXT NOT NULL, page_url TEXT NOT NULL, evidence TEXT NOT NULL, UNIQUE(provider,source_id));
CREATE TABLE licenses (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, obligations TEXT NOT NULL DEFAULT '');
CREATE TABLE images (
 id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('REAL','AI')), title TEXT NOT NULL,
 description TEXT NOT NULL, author TEXT NOT NULL, source_id TEXT REFERENCES sources(id), license_id TEXT REFERENCES licenses(id),
 authenticity_evidence TEXT NOT NULL, r2_key TEXT NOT NULL UNIQUE, ai_model TEXT, ai_prompt TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 difficulty TEXT NOT NULL CHECK(difficulty IN ('facile','medio','difficile')),
 status TEXT NOT NULL CHECK(status IN ('candidate','in-review','approved','rejected')) DEFAULT 'candidate',
 sha256 TEXT NOT NULL, perceptual_hash TEXT, rights_verified_at TEXT, explanation TEXT NOT NULL,
 demo INTEGER NOT NULL DEFAULT 0 CHECK(demo IN (0,1)), CHECK(type != 'AI' OR (ai_model IS NOT NULL AND ai_prompt IS NOT NULL))
);
CREATE TABLE image_categories (image_id TEXT REFERENCES images(id), category_id TEXT REFERENCES categories(id), PRIMARY KEY(image_id,category_id));
CREATE TABLE review_events (id TEXT PRIMARY KEY, image_id TEXT NOT NULL REFERENCES images(id), reviewer TEXT NOT NULL, decision TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE game_sessions (id TEXT PRIMARY KEY, player_id TEXT REFERENCES players(id), mode TEXT NOT NULL CHECK(mode IN ('training','timed')), created_at INTEGER NOT NULL, expires_at INTEGER, completed INTEGER NOT NULL DEFAULT 0, owner_hash TEXT NOT NULL);
CREATE TABLE game_rounds (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES game_sessions(id), image_id TEXT NOT NULL REFERENCES images(id), position INTEGER NOT NULL, presented_at INTEGER, UNIQUE(session_id,position), UNIQUE(session_id,image_id));
CREATE TABLE answers (round_id TEXT PRIMARY KEY REFERENCES game_rounds(id), choice TEXT NOT NULL CHECK(choice IN ('REAL','AI')), correct INTEGER NOT NULL CHECK(correct IN (0,1)), answered_at INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL CHECK(elapsed_ms>=0));
CREATE TABLE challenges (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, completed_at INTEGER, settings TEXT NOT NULL);
CREATE TABLE challenge_players (challenge_id TEXT REFERENCES challenges(id), player_id TEXT REFERENCES players(id), score INTEGER NOT NULL DEFAULT 0, elapsed_ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(challenge_id,player_id));
CREATE TABLE challenge_answers (challenge_id TEXT REFERENCES challenges(id), player_id TEXT REFERENCES players(id), round INTEGER NOT NULL, image_id TEXT REFERENCES images(id), choice TEXT NOT NULL, correct INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL, PRIMARY KEY(challenge_id,player_id,round));
CREATE INDEX image_status_difficulty ON images(status,difficulty,demo);
CREATE INDEX category_images ON image_categories(category_id,image_id);
CREATE INDEX session_rounds ON game_rounds(session_id,position);
CREATE INDEX image_rounds ON game_rounds(image_id);
CREATE INDEX review_image ON review_events(image_id,created_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
