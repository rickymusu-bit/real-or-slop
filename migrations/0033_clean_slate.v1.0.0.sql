-- v1.0.0, 2026-11-09T16:30:00Z: clean slate (docs/libreria-immagini.v1.1.0.md, section 9).
-- DESTRUCTIVE by explicit owner decision of 2026-11-09: «Voglio un database in ordine, senza archivi storici
-- inutili»; everything reset, no export, «non si torna indietro». Drops every table and view created by the
-- previous migrations 0001-0032 (triggers and indexes go with their tables) and creates the new schema:
-- the image library, its tags and the game tables. Apply in production only with the owner's authorization.
PRAGMA defer_foreign_keys = ON;
DROP VIEW IF EXISTS editorial_budget_current;
DROP VIEW IF EXISTS editorial_budget_usage;
DROP VIEW IF EXISTS editorial_cycle_ready_images;
DROP VIEW IF EXISTS editorial_review_effective_images;
DROP VIEW IF EXISTS image_answer_statistics;
DROP VIEW IF EXISTS reference_real_conflicts;
DROP VIEW IF EXISTS similarity_asset_categories;
DROP VIEW IF EXISTS similarity_assets;
DROP VIEW IF EXISTS similarity_current_pairs;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS challenge_answers;
DROP TABLE IF EXISTS challenge_players;
DROP TABLE IF EXISTS editorial_attempt_media;
DROP TABLE IF EXISTS editorial_batch_reservations;
DROP TABLE IF EXISTS editorial_batch_sources;
DROP TABLE IF EXISTS editorial_budget_allocations;
DROP TABLE IF EXISTS editorial_controls;
DROP TABLE IF EXISTS editorial_cycle_admissions;
DROP TABLE IF EXISTS editorial_feedback;
DROP TABLE IF EXISTS editorial_image_geometry;
DROP TABLE IF EXISTS editorial_image_profiles;
DROP TABLE IF EXISTS editorial_image_relevance;
DROP TABLE IF EXISTS editorial_image_reviews;
DROP TABLE IF EXISTS editorial_image_tag_events;
DROP TABLE IF EXISTS editorial_image_tags;
DROP TABLE IF EXISTS editorial_lot_events;
DROP TABLE IF EXISTS editorial_lot_removals;
DROP TABLE IF EXISTS editorial_lots;
DROP TABLE IF EXISTS editorial_preference_snapshot_chunks;
DROP TABLE IF EXISTS editorial_preparations;
DROP TABLE IF EXISTS editorial_review_deleted_images;
DROP TABLE IF EXISTS editorial_review_game_copies;
DROP TABLE IF EXISTS editorial_review_inbox_events;
DROP TABLE IF EXISTS editorial_review_presentations;
DROP TABLE IF EXISTS editorial_slop_prompt_bank;
DROP TABLE IF EXISTS editorial_topic_description_drafts;
DROP TABLE IF EXISTS editorial_topic_description_jobs;
DROP TABLE IF EXISTS editorial_topic_discovery_settings;
DROP TABLE IF EXISTS editorial_topic_explorations;
DROP TABLE IF EXISTS editorial_topic_semantic_history;
DROP TABLE IF EXISTS editorial_topic_semantics;
DROP TABLE IF EXISTS editorial_topic_slop_seed;
DROP TABLE IF EXISTS editorial_topic_suggestion_assessments;
DROP TABLE IF EXISTS editorial_topic_suggestion_runs;
DROP TABLE IF EXISTS editorial_topic_suggestion_screening;
DROP TABLE IF EXISTS editorial_topic_suggestion_semantics;
DROP TABLE IF EXISTS editorial_v2_reservations;
DROP TABLE IF EXISTS editorial_v2_reviews;
DROP TABLE IF EXISTS editorial_workspace_acquisitions;
DROP TABLE IF EXISTS editorial_workspace_generation_claims;
DROP TABLE IF EXISTS editorial_workspace_jobs;
DROP TABLE IF EXISTS editorial_workspace_manual_stage;
DROP TABLE IF EXISTS editorial_workspace_proposal_dismissals;
DROP TABLE IF EXISTS game_catalog_control;
DROP TABLE IF EXISTS game_catalog_mode_events;
DROP TABLE IF EXISTS image_categories;
DROP TABLE IF EXISTS image_curation;
DROP TABLE IF EXISTS image_curation_events;
DROP TABLE IF EXISTS legacy_image_difficulty;
DROP TABLE IF EXISTS media_events;
DROP TABLE IF EXISTS published_images;
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS similarity_categories;
DROP TABLE IF EXISTS similarity_events;
DROP TABLE IF EXISTS similarity_features;
DROP TABLE IF EXISTS similarity_indexed_assets;
DROP TABLE IF EXISTS slop_plan_events;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS challenges;
DROP TABLE IF EXISTS editorial_attempts;
DROP TABLE IF EXISTS editorial_batch_runs;
DROP TABLE IF EXISTS editorial_budget_periods;
DROP TABLE IF EXISTS editorial_preference_snapshots;
DROP TABLE IF EXISTS editorial_review_inbox;
DROP TABLE IF EXISTS editorial_tags;
DROP TABLE IF EXISTS editorial_topic_suggestions;
DROP TABLE IF EXISTS editorial_usage;
DROP TABLE IF EXISTS editorial_v2_candidates;
DROP TABLE IF EXISTS editorial_workspace_proposals;
DROP TABLE IF EXISTS game_rounds;
DROP TABLE IF EXISTS publication_batches;
DROP TABLE IF EXISTS review_events;
DROP TABLE IF EXISTS similarity_pairs;
DROP TABLE IF EXISTS slop_plans;
DROP TABLE IF EXISTS editorial_v2_runs;
DROP TABLE IF EXISTS editorial_workspace_topics;
DROP TABLE IF EXISTS game_sessions;
DROP TABLE IF EXISTS images;
DROP TABLE IF EXISTS reference_photos;
DROP TABLE IF EXISTS licenses;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS sources;

-- Image library: one row per image, REAL or SLOP. Emptying the trash deletes the row and, by cascade,
-- every other row about the image (tags, game rounds, answers).
CREATE TABLE images (
 id TEXT PRIMARY KEY,
 origin TEXT NOT NULL CHECK(origin IN ('REAL','SLOP')),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','approved','published','trash')),
 trashed_from TEXT CHECK(trashed_from IS NULL OR trashed_from IN ('new','approved')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1000),
 caption TEXT NOT NULL DEFAULT '' CHECK(length(caption) <= 160),
 explanation TEXT NOT NULL DEFAULT '' CHECK(length(explanation) <= 2000),
 source_url TEXT NOT NULL DEFAULT '',
 author TEXT NOT NULL DEFAULT '' CHECK(length(author) <= 300),
 license_name TEXT NOT NULL DEFAULT '' CHECK(length(license_name) <= 200),
 license_url TEXT NOT NULL DEFAULT '',
 prompt TEXT NOT NULL DEFAULT '' CHECK(length(prompt) <= 4000),
 model TEXT NOT NULL DEFAULT '' CHECK(length(model) <= 100),
 original_key TEXT NOT NULL UNIQUE,
 original_sha256 TEXT NOT NULL UNIQUE CHECK(length(original_sha256) = 64),
 original_mime TEXT NOT NULL CHECK(original_mime IN ('image/jpeg','image/png','image/webp')),
 width INTEGER NOT NULL CHECK(width > 0),
 height INTEGER NOT NULL CHECK(height > 0),
 copy_key TEXT UNIQUE,
 copy_sha256 TEXT CHECK(copy_sha256 IS NULL OR length(copy_sha256) = 64),
 copy_width INTEGER CHECK(copy_width IS NULL OR copy_width BETWEEN 1 AND 2048),
 copy_height INTEGER CHECK(copy_height IS NULL OR copy_height BETWEEN 1 AND 2048),
 copy_bytes INTEGER CHECK(copy_bytes IS NULL OR copy_bytes BETWEEN 1 AND 4000000),
 rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(rights_confirmed IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 approved_at TEXT,
 published_at TEXT,
 trashed_at TEXT,
 CHECK((copy_key IS NULL) = (copy_sha256 IS NULL)),
 CHECK(status IN ('new','trash') OR copy_key IS NOT NULL),
 CHECK(status <> 'trash' OR trashed_from IS NOT NULL)
);
CREATE INDEX images_status ON images(status, origin, updated_at);

-- Tags: lowercase ASCII words joined by single hyphens (docs/libreria-immagini.v1.1.0.md, section 3).
CREATE TABLE tags (
 id TEXT PRIMARY KEY,
 label TEXT NOT NULL UNIQUE CHECK(length(label) BETWEEN 1 AND 40 AND label NOT GLOB '*[^a-z0-9-]*'
   AND label NOT GLOB '-*' AND label NOT GLOB '*-' AND label NOT GLOB '*--*' AND label <> 'untagged'),
 created_at TEXT NOT NULL
);
CREATE TABLE image_tags (
 image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
 tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
 PRIMARY KEY(image_id, tag_id)
);
CREATE INDEX image_tags_tag ON image_tags(tag_id);

-- Game: same structure as before, image references cascade with the library.
CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE game_sessions (id TEXT PRIMARY KEY, player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
 mode TEXT NOT NULL CHECK(mode IN ('training','timed')), created_at INTEGER NOT NULL, expires_at INTEGER,
 completed INTEGER NOT NULL DEFAULT 0, owner_hash TEXT NOT NULL,
 protocol_version INTEGER NOT NULL DEFAULT 2 CHECK(protocol_version IN (1,2)),
 phase TEXT NOT NULL DEFAULT 'active' CHECK(phase IN ('preparing','active','completed','invalidated')),
 duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds IN (60,120,180)),
 started_at INTEGER, preparation_expires_at INTEGER, invalid_reason TEXT,
 timing_mode TEXT NOT NULL DEFAULT 'per-image' CHECK(timing_mode IN ('legacy','unlimited','per-image')),
 round_seconds INTEGER CHECK(round_seconds IS NULL OR round_seconds IN (10,20,30)));
CREATE TABLE game_rounds (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
 image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE, position INTEGER NOT NULL,
 presented_at INTEGER, expires_at INTEGER, timed_out INTEGER NOT NULL DEFAULT 0 CHECK(timed_out IN (0,1)),
 UNIQUE(session_id,position), UNIQUE(session_id,image_id));
CREATE INDEX session_rounds ON game_rounds(session_id,position);
CREATE INDEX image_rounds ON game_rounds(image_id);
CREATE TABLE answers (round_id TEXT PRIMARY KEY REFERENCES game_rounds(id) ON DELETE CASCADE,
 choice TEXT NOT NULL CHECK(choice IN ('REAL','AI')), correct INTEGER NOT NULL CHECK(correct IN (0,1)),
 answered_at INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL CHECK(elapsed_ms>=0));
CREATE TABLE challenges (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, completed_at INTEGER, settings TEXT NOT NULL,
 outcome TEXT NOT NULL DEFAULT 'active' CHECK(outcome IN ('active','completed','abandoned','invalidated')));
CREATE TABLE challenge_players (challenge_id TEXT REFERENCES challenges(id) ON DELETE CASCADE,
 player_id TEXT REFERENCES players(id) ON DELETE CASCADE, score INTEGER NOT NULL DEFAULT 0,
 elapsed_ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(challenge_id,player_id));
CREATE TABLE challenge_answers (challenge_id TEXT REFERENCES challenges(id) ON DELETE CASCADE,
 player_id TEXT REFERENCES players(id) ON DELETE CASCADE, round INTEGER NOT NULL,
 image_id TEXT REFERENCES images(id) ON DELETE CASCADE, choice TEXT NOT NULL, correct INTEGER NOT NULL,
 elapsed_ms INTEGER NOT NULL, PRIMARY KEY(challenge_id,player_id,round));
CREATE TABLE media_events (id TEXT PRIMARY KEY NOT NULL,
 session_id TEXT REFERENCES game_sessions(id) ON DELETE CASCADE,
 challenge_id TEXT REFERENCES challenges(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('started','invalidated','preparation_expired','abandoned','load_failed')),
 reason TEXT NOT NULL, created_at INTEGER NOT NULL, CHECK((session_id IS NULL) != (challenge_id IS NULL)));
CREATE INDEX media_session_events ON media_events(session_id,created_at);
CREATE INDEX media_challenge_events ON media_events(challenge_id,created_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
