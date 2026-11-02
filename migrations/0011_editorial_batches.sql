-- Durable, private Batch orchestration. No catalogue/session/history rewrites.
CREATE TABLE editorial_batch_runs (
 id TEXT PRIMARY KEY, day TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('active','paused','completed','cancelled','stopped')),
 stage TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 20),
 config_json TEXT NOT NULL CHECK(json_valid(config_json)),
 checkpoint_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(checkpoint_json)),
 files_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(files_json)),
 revision INTEGER NOT NULL DEFAULT 0,
 lease_hash TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TRIGGER batch_config_immutable BEFORE UPDATE OF id,day,capacity,config_json,created_at ON editorial_batch_runs BEGIN SELECT RAISE(ABORT,'Batch configuration is immutable'); END;
CREATE TABLE editorial_batch_sources (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES editorial_batch_runs(id),
 provider TEXT NOT NULL, source_id TEXT NOT NULL, source_url TEXT NOT NULL UNIQUE,
 original_sha256 TEXT NOT NULL UNIQUE, file_sha256 TEXT NOT NULL UNIQUE,
 perceptual_hash TEXT NOT NULL CHECK(length(perceptual_hash)=16),
 UNIQUE(provider,source_id)
);
CREATE TRIGGER batch_sources_no_update BEFORE UPDATE ON editorial_batch_sources BEGIN SELECT RAISE(ABORT,'Batch source claims are immutable'); END;
CREATE TRIGGER batch_sources_no_delete BEFORE DELETE ON editorial_batch_sources BEGIN SELECT RAISE(ABORT,'Batch source claims are immutable'); END;
CREATE TABLE editorial_batch_reservations (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES editorial_batch_runs(id),
 day TEXT NOT NULL, requests_json TEXT NOT NULL CHECK(json_valid(requests_json)),
 reserved_usd REAL NOT NULL CHECK(reserved_usd>0), created_at TEXT NOT NULL
);
CREATE TRIGGER batch_reservation_usage AFTER INSERT ON editorial_batch_reservations
BEGIN INSERT INTO editorial_usage
 SELECT json_extract(value,'$.id'),NEW.run_id,NEW.day,json_extract(value,'$.kind'),json_extract(value,'$.cost'),NEW.created_at FROM json_each(NEW.requests_json); END;
CREATE TRIGGER batch_reservation_no_update BEFORE UPDATE ON editorial_batch_reservations BEGIN SELECT RAISE(ABORT,'Batch reservations are immutable'); END;
CREATE TRIGGER batch_reservation_no_delete BEFORE DELETE ON editorial_batch_reservations BEGIN SELECT RAISE(ABORT,'Batch reservations are immutable'); END;
-- A synchronous/other run cannot take a source while its Batch ranking is pending.
CREATE TRIGGER reference_claim_owner BEFORE INSERT ON reference_photos
BEGIN SELECT RAISE(ABORT,'Photo belongs to another Batch run') WHERE EXISTS(
 SELECT 1 FROM editorial_batch_sources c WHERE c.run_id!=NEW.batch_id AND
 (c.id=NEW.id OR c.source_url=NEW.source_url OR (c.provider=NEW.provider AND c.source_id=NEW.source_id) OR c.original_sha256=NEW.original_sha256 OR c.file_sha256=NEW.file_sha256)
); END;
CREATE TRIGGER real_pending_batch BEFORE INSERT ON images WHEN NEW.type='REAL'
BEGIN SELECT RAISE(ABORT,'Pending Batch photo cannot enter REAL') WHERE EXISTS(
 SELECT 1 FROM editorial_batch_sources c LEFT JOIN sources s ON s.id=NEW.source_id
 WHERE (c.source_url=s.page_url OR (c.provider=s.provider AND c.source_id=s.source_id) OR NEW.sha256 IN (c.original_sha256,c.file_sha256))
 AND NOT EXISTS(SELECT 1 FROM reference_photos r WHERE r.id=c.id AND r.role='REAL')
); END;
CREATE TRIGGER batch_source_near_duplicate BEFORE INSERT ON editorial_batch_sources
BEGIN SELECT RAISE(ABORT,'Near duplicate reference') WHERE EXISTS(
 SELECT 1 FROM (SELECT perceptual_hash FROM editorial_batch_sources UNION ALL SELECT perceptual_hash FROM reference_photos UNION ALL SELECT perceptual_hash FROM images WHERE perceptual_hash IS NOT NULL) r WHERE (WITH RECURSIVE positions(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM positions WHERE n<16)
 SELECT sum(CAST(substr('0112122312232334',1+(
 ((instr('0123456789abcdef',substr(NEW.perceptual_hash,n,1))-1) | (instr('0123456789abcdef',substr(r.perceptual_hash,n,1))-1)) -
 ((instr('0123456789abcdef',substr(NEW.perceptual_hash,n,1))-1) & (instr('0123456789abcdef',substr(r.perceptual_hash,n,1))-1))),1) AS INTEGER)) FROM positions)<=5);
END;
