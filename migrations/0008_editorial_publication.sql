-- Provenance and generation dossiers are private. AI remains the wire label.
CREATE TABLE reference_photos (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, source_id TEXT NOT NULL,
 source_url TEXT NOT NULL UNIQUE, original_sha256 TEXT NOT NULL UNIQUE,
 file_sha256 TEXT NOT NULL UNIQUE, perceptual_hash TEXT NOT NULL CHECK(length(perceptual_hash)=16),
 role TEXT NOT NULL CHECK(role IN ('REAL','SLOP')), batch_id TEXT NOT NULL,
 rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 20),
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 evaluation_json TEXT NOT NULL CHECK(json_valid(evaluation_json)),
 created_at TEXT NOT NULL, UNIQUE(provider,source_id), UNIQUE(batch_id,rank)
);
CREATE TABLE editorial_attempts (
 id TEXT PRIMARY KEY, reference_id TEXT NOT NULL REFERENCES reference_photos(id),
 image_id TEXT UNIQUE REFERENCES images(id),
 dossier_json TEXT NOT NULL CHECK(json_valid(dossier_json)), created_at TEXT NOT NULL
);
CREATE TABLE editorial_image_reviews (
 image_id TEXT PRIMARY KEY REFERENCES images(id), reference_id TEXT NOT NULL REFERENCES reference_photos(id),
 evaluation_json TEXT NOT NULL CHECK(json_valid(evaluation_json)), created_at TEXT NOT NULL
);
CREATE TABLE editorial_usage (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL, day TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('evaluation','generation','regeneration')),
 reserved_usd REAL NOT NULL CHECK(reserved_usd>0), created_at TEXT NOT NULL
);
CREATE INDEX editorial_usage_day ON editorial_usage(day,run_id);
-- Nibble distances permit a server-enforced <=5-bit dHash exclusion, including
-- concurrent registrations/uploads (JS preflight alone cannot guarantee this).
CREATE VIEW reference_real_conflicts AS
 SELECT r.id AS reference_id,i.id AS image_id FROM reference_photos r JOIN images i ON i.type='REAL'
 LEFT JOIN sources s ON s.id=i.source_id
 WHERE r.role='SLOP' AND (
 (s.provider=r.provider AND s.source_id=r.source_id) OR s.page_url=r.source_url OR
 i.sha256 IN (r.original_sha256,r.file_sha256) OR
 (length(i.perceptual_hash)=16 AND (WITH RECURSIVE positions(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM positions WHERE n<16)
 SELECT sum(CAST(substr('0112122312232334',1+(
 ((instr('0123456789abcdef',lower(substr(i.perceptual_hash,n,1)))-1) | (instr('0123456789abcdef',substr(r.perceptual_hash,n,1))-1)) -
 ((instr('0123456789abcdef',lower(substr(i.perceptual_hash,n,1)))-1) & (instr('0123456789abcdef',substr(r.perceptual_hash,n,1))-1))),1) AS INTEGER)) FROM positions)<=5)
 );
CREATE TRIGGER reference_exclusion AFTER INSERT ON reference_photos
 BEGIN SELECT RAISE(ABORT,'SLOP reference overlaps REAL') WHERE EXISTS(SELECT 1 FROM reference_real_conflicts); END;
CREATE TRIGGER real_reference_exclusion_insert AFTER INSERT ON images
 BEGIN SELECT RAISE(ABORT,'REAL overlaps SLOP reference') WHERE EXISTS(SELECT 1 FROM reference_real_conflicts); END;
CREATE TRIGGER real_reference_exclusion_update AFTER UPDATE OF source_id,type,sha256,perceptual_hash ON images
 BEGIN SELECT RAISE(ABORT,'REAL overlaps SLOP reference') WHERE EXISTS(SELECT 1 FROM reference_real_conflicts); END;
CREATE TRIGGER source_reference_exclusion AFTER UPDATE ON sources
 BEGIN SELECT RAISE(ABORT,'REAL overlaps SLOP reference') WHERE EXISTS(SELECT 1 FROM reference_real_conflicts); END;
CREATE TRIGGER references_immutable_update BEFORE UPDATE ON reference_photos BEGIN SELECT RAISE(ABORT,'Reference registry is immutable'); END;
CREATE TRIGGER references_immutable_delete BEFORE DELETE ON reference_photos BEGIN SELECT RAISE(ABORT,'Reference registry is immutable'); END;
CREATE TRIGGER attempts_immutable_update BEFORE UPDATE ON editorial_attempts BEGIN SELECT RAISE(ABORT,'Generation provenance is immutable'); END;
CREATE TRIGGER attempts_immutable_delete BEFORE DELETE ON editorial_attempts BEGIN SELECT RAISE(ABORT,'Generation provenance is immutable'); END;

CREATE TABLE publication_batches (
 id TEXT PRIMARY KEY, image_ids TEXT NOT NULL CHECK(json_valid(image_ids) AND json_type(image_ids)='array'),
 reviewer TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE published_images (
 image_id TEXT PRIMARY KEY REFERENCES images(id), batch_id TEXT NOT NULL REFERENCES publication_batches(id),
 published_at TEXT NOT NULL
);
-- Preserve ALL pre-existing playable assets. Refuse an unsafe baseline instead
-- of silently withdrawing images: preflight/repair instructions in the runbook.
CREATE TABLE publication_baseline_guard (balanced INTEGER CHECK(balanced=1));
INSERT INTO publication_baseline_guard SELECT CASE WHEN NOT EXISTS(
 SELECT demo FROM images WHERE status='approved' GROUP BY demo HAVING sum(type='REAL')!=sum(type='AI')
) THEN 1 ELSE 0 END;
DROP TABLE publication_baseline_guard;
INSERT INTO publication_batches SELECT 'legacy',json_group_array(id),'legacy-migration',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM images WHERE status='approved';
INSERT INTO published_images SELECT id,'legacy',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM images WHERE status='approved';

CREATE TRIGGER validate_publication BEFORE INSERT ON publication_batches
BEGIN
 SELECT RAISE(ABORT,'Publication requires distinct approved, human-reviewed images') WHERE
 json_array_length(NEW.image_ids)=0 OR
 (SELECT count(DISTINCT value) FROM json_each(NEW.image_ids))!=json_array_length(NEW.image_ids) OR
 EXISTS(SELECT 1 FROM json_each(NEW.image_ids) j LEFT JOIN images i ON i.id=j.value
 WHERE i.id IS NULL OR i.status!='approved' OR i.sha256='pending' OR
 (i.demo=0 AND NOT EXISTS(SELECT 1 FROM review_events e WHERE e.image_id=i.id AND e.decision='approved')) OR
 EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=i.id));
 SELECT RAISE(ABORT,'Publication must preserve exact REAL/AI balance per environment') WHERE EXISTS(
 SELECT demo FROM images WHERE id IN (SELECT value FROM json_each(NEW.image_ids)) OR id IN (SELECT image_id FROM published_images)
 GROUP BY demo HAVING sum(type='REAL')!=sum(type='AI'));
END;
CREATE TRIGGER apply_publication AFTER INSERT ON publication_batches
BEGIN INSERT INTO published_images SELECT value,NEW.id,NEW.created_at FROM json_each(NEW.image_ids); END;
CREATE TRIGGER publication_membership BEFORE INSERT ON published_images
BEGIN SELECT RAISE(ABORT,'Publication batch membership required') WHERE NOT EXISTS(
 SELECT 1 FROM publication_batches b,json_each(b.image_ids) j WHERE b.id=NEW.batch_id AND j.value=NEW.image_id); END;
CREATE TRIGGER published_no_update BEFORE UPDATE ON published_images BEGIN SELECT RAISE(ABORT,'Published assets are immutable'); END;
CREATE TRIGGER published_no_delete BEFORE DELETE ON published_images WHEN (SELECT demo FROM images WHERE id=OLD.image_id)=0
 BEGIN SELECT RAISE(ABORT,'Published assets cannot be withdrawn automatically'); END;
CREATE TRIGGER published_image_stable BEFORE UPDATE OF type,status,demo,sha256,r2_key ON images
 WHEN EXISTS(SELECT 1 FROM published_images WHERE image_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'Published asset identity is immutable'); END;
CREATE TRIGGER publication_no_update BEFORE UPDATE ON publication_batches BEGIN SELECT RAISE(ABORT,'Publication audit is immutable'); END;
CREATE TRIGGER publication_no_delete BEFORE DELETE ON publication_batches BEGIN SELECT RAISE(ABORT,'Publication audit is immutable'); END;

CREATE TABLE editorial_controls (id INTEGER PRIMARY KEY CHECK(id=1), queue_limit INTEGER NOT NULL CHECK(queue_limit BETWEEN 1 AND 1000));
INSERT INTO editorial_controls VALUES(1,100);
CREATE TRIGGER private_queue_cap BEFORE INSERT ON images WHEN NEW.demo=0
BEGIN SELECT RAISE(ABORT,'Private queue limit reached') WHERE
 (SELECT count(*) FROM images WHERE demo=0 AND status IN ('candidate','in-review','approved') AND id NOT IN (SELECT image_id FROM published_images)) >= (SELECT queue_limit FROM editorial_controls WHERE id=1); END;
CREATE TRIGGER daily_reference_cap BEFORE INSERT ON reference_photos
BEGIN SELECT RAISE(ABORT,'Daily reference limit reached') WHERE
 (SELECT count(*) FROM reference_photos WHERE substr(created_at,1,10)=substr(NEW.created_at,1,10))>=20 OR
 (SELECT count(*) FROM reference_photos WHERE role=NEW.role AND substr(created_at,1,10)=substr(NEW.created_at,1,10))>=10;
END;
CREATE TRIGGER reference_near_duplicate BEFORE INSERT ON reference_photos
BEGIN SELECT RAISE(ABORT,'Near duplicate reference') WHERE EXISTS(
 SELECT 1 FROM reference_photos r WHERE (WITH RECURSIVE positions(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM positions WHERE n<16)
 SELECT sum(CAST(substr('0112122312232334',1+(
 ((instr('0123456789abcdef',substr(NEW.perceptual_hash,n,1))-1) | (instr('0123456789abcdef',substr(r.perceptual_hash,n,1))-1)) -
 ((instr('0123456789abcdef',substr(NEW.perceptual_hash,n,1))-1) & (instr('0123456789abcdef',substr(r.perceptual_hash,n,1))-1))),1) AS INTEGER)) FROM positions)<=5);
END;
CREATE TRIGGER daily_accepted_slop_cap BEFORE INSERT ON editorial_attempts WHEN NEW.image_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Daily SLOP limit reached') WHERE
 (SELECT count(*) FROM editorial_attempts WHERE image_id IS NOT NULL AND substr(created_at,1,10)=substr(NEW.created_at,1,10))>=10;
END;
