-- Non-destructive presentation of an explicitly approved source. The owner
-- requested technical standardization; no new human vote is invented.
CREATE TABLE editorial_review_presentations (
 image_id TEXT PRIMARY KEY,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 source_revision INTEGER NOT NULL CHECK(source_revision>=0),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 media_key TEXT NOT NULL,
 width INTEGER NOT NULL CHECK(width=1024),
 height INTEGER NOT NULL CHECK(height=1024),
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 created_at TEXT NOT NULL
);
CREATE TRIGGER review_presentation_requires_approved BEFORE INSERT ON editorial_review_presentations
 WHEN NOT EXISTS(SELECT 1 FROM editorial_review_inbox i WHERE i.id=NEW.image_id AND i.status='approved'
   AND i.sha256=NEW.source_sha256 AND i.revision=NEW.source_revision)
   OR json_extract(NEW.metadata_json,'$.normalization.owner_requested') IS NOT 1
   OR json_extract(NEW.metadata_json,'$.normalization.approved_source_sha256') IS NOT NEW.source_sha256
   OR json_extract(NEW.metadata_json,'$.normalization.crop_decision.preserves_context') IS NOT 1
   OR json_extract(NEW.metadata_json,'$.normalization.crop_decision.needs_review') IS NOT 0
   OR json_extract(NEW.metadata_json,'$.profile_image_sha256') IS NOT NEW.sha256
 BEGIN SELECT RAISE(ABORT,'Current approved source and explicit technical normalization required'); END;
CREATE TRIGGER review_presentation_no_update BEFORE UPDATE ON editorial_review_presentations
 BEGIN SELECT RAISE(ABORT,'Presentation trace is immutable'); END;
CREATE TRIGGER review_presentation_no_delete BEFORE DELETE ON editorial_review_presentations
 BEGIN SELECT RAISE(ABORT,'Presentation trace preserves review history'); END;

CREATE VIEW editorial_review_effective_images AS
 SELECT i.id,i.origin,COALESCE(p.sha256,i.sha256) AS sha256,
   COALESCE(p.media_key,i.media_key) AS media_key,
   CASE WHEN p.image_id IS NULL THEN i.metadata_json ELSE json_set(i.metadata_json,
     '$.profile',json_extract(p.metadata_json,'$.profile'),
     '$.profile_image_sha256',p.sha256,
     '$.presentation',json_extract(p.metadata_json,'$.presentation'),
     '$.normalization',json_extract(p.metadata_json,'$.normalization')) END AS metadata_json,
   i.pair_key,i.status,i.revision,i.created_at,i.sha256 AS source_sha256
 FROM editorial_review_inbox i LEFT JOIN editorial_review_presentations p
   ON p.image_id=i.id AND p.source_sha256=i.sha256;

-- A deleted image must not return as either its old frame or its standard copy.
DROP TRIGGER review_inbox_prevent_reimport;
CREATE TRIGGER review_inbox_prevent_reimport BEFORE INSERT ON editorial_review_inbox
 WHEN EXISTS(SELECT 1 FROM editorial_review_deleted_images d WHERE d.image_id=NEW.id
   OR (d.origin=NEW.origin AND (d.sha256=NEW.sha256 OR EXISTS(
     SELECT 1 FROM editorial_review_presentations p WHERE p.image_id=d.image_id AND p.sha256=NEW.sha256))))
 BEGIN SELECT RAISE(IGNORE); END;
