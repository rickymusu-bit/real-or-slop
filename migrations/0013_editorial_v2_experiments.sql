-- Additive experimental archive. No changes to images, publication or gameplay.
-- V2 has no photographic references for SLOP and no legacy editorial priors.
CREATE TABLE editorial_v2_runs (
 id TEXT PRIMARY KEY, origin TEXT NOT NULL CHECK(origin IN ('REAL','AI')),
 status TEXT NOT NULL CHECK(status IN ('active','paused','completed','cancelled','stopped')),
 stage TEXT NOT NULL, config_json TEXT NOT NULL CHECK(json_valid(config_json)),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 checkpoint_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(checkpoint_json)),
 files_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(files_json)),
 revision INTEGER NOT NULL DEFAULT 0, lease_hash TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TRIGGER v2_run_identity_immutable BEFORE UPDATE OF id,origin,config_json,input_json,created_at ON editorial_v2_runs
 BEGIN SELECT RAISE(ABORT,'V2 run identity is immutable'); END;
CREATE TABLE editorial_v2_reservations (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES editorial_v2_runs(id),
 day TEXT NOT NULL, requests_json TEXT NOT NULL CHECK(json_valid(requests_json)),
 reserved_usd REAL NOT NULL CHECK(reserved_usd>0), created_at TEXT NOT NULL
);
CREATE TRIGGER v2_reservation_usage AFTER INSERT ON editorial_v2_reservations
 BEGIN INSERT INTO editorial_usage SELECT json_extract(value,'$.id'),'v2-'||NEW.run_id,NEW.day,
 json_extract(value,'$.kind'),json_extract(value,'$.cost'),NEW.created_at FROM json_each(NEW.requests_json); END;
CREATE TRIGGER v2_reservation_no_update BEFORE UPDATE ON editorial_v2_reservations BEGIN SELECT RAISE(ABORT,'V2 reservations are immutable'); END;
CREATE TRIGGER v2_reservation_no_delete BEFORE DELETE ON editorial_v2_reservations BEGIN SELECT RAISE(ABORT,'V2 reservations are immutable'); END;
CREATE TABLE editorial_v2_candidates (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES editorial_v2_runs(id),
 origin TEXT NOT NULL CHECK(origin IN ('REAL','AI')),
 original_sha256 TEXT NOT NULL, preview_sha256 TEXT NOT NULL,
 dossier_json TEXT NOT NULL CHECK(json_valid(dossier_json)),
 review_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(review_json)),
 review_state TEXT NOT NULL DEFAULT 'quarantine' CHECK(review_state IN ('quarantine','approved','rejected')),
 revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX v2_candidates_run ON editorial_v2_candidates(run_id,review_state);
CREATE INDEX v2_candidates_hash ON editorial_v2_candidates(preview_sha256);
CREATE TRIGGER v2_dossier_immutable BEFORE UPDATE OF id,run_id,origin,original_sha256,preview_sha256,dossier_json,created_at ON editorial_v2_candidates
 BEGIN SELECT RAISE(ABORT,'V2 original dossiers are immutable'); END;
CREATE TRIGGER v2_candidate_no_delete BEFORE DELETE ON editorial_v2_candidates BEGIN SELECT RAISE(ABORT,'V2 candidates remain in the private audit archive'); END;
CREATE TABLE editorial_v2_reviews (
 id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES editorial_v2_candidates(id),
 revision INTEGER NOT NULL, reviewer TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
 review_json TEXT NOT NULL CHECK(json_valid(review_json)), created_at TEXT NOT NULL,
 UNIQUE(candidate_id,revision)
);
CREATE TRIGGER v2_review_no_update BEFORE UPDATE ON editorial_v2_reviews BEGIN SELECT RAISE(ABORT,'V2 reviews are immutable'); END;
CREATE TRIGGER v2_review_no_delete BEFORE DELETE ON editorial_v2_reviews BEGIN SELECT RAISE(ABORT,'V2 reviews are immutable'); END;
-- There is intentionally no FK into images and no publication endpoint. An
-- experimental approval cannot make a candidate playable through any legacy UI.
