-- Additive bridge: personal inbox approval and separate documentary admission.
-- No historical votes, files, image identities or publications are rewritten.
CREATE TABLE editorial_cycle_admissions (
 id TEXT PRIMARY KEY,
 cycle_id TEXT NOT NULL,
 inbox_id TEXT NOT NULL,
 image_id TEXT NOT NULL REFERENCES images(id),
 image_sha256 TEXT NOT NULL CHECK(length(image_sha256)=64),
 review_revision INTEGER NOT NULL CHECK(review_revision>0),
 attestation_json TEXT NOT NULL CHECK(json_valid(attestation_json)),
 reviewer TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(inbox_id,review_revision)
);
CREATE INDEX editorial_cycle_members ON editorial_cycle_admissions(cycle_id,image_id);
CREATE TRIGGER cycle_admission_valid BEFORE INSERT ON editorial_cycle_admissions
 WHEN NOT EXISTS(SELECT 1 FROM editorial_review_effective_images q JOIN images i ON i.id=NEW.image_id
   JOIN review_events e ON e.image_id=i.id AND e.decision='approved'
   WHERE q.id=NEW.inbox_id AND q.status='approved' AND q.revision=NEW.review_revision
     AND q.sha256=NEW.image_sha256 AND q.origin=i.type AND i.sha256=q.sha256
     AND i.status='approved' AND i.demo=0 AND i.rights_verified_at IS NOT NULL
     AND EXISTS(SELECT 1 FROM editorial_review_inbox_events v WHERE v.image_id=q.id
       AND v.revision=q.revision AND v.decision='approved' AND v.image_sha256=q.sha256))
   OR json_extract(NEW.attestation_json,'$.rights_confirmed') IS NOT 1
   OR json_extract(NEW.attestation_json,'$.authenticity_confirmed') IS NOT 1
   OR EXISTS(SELECT 1 FROM editorial_cycle_admissions a WHERE a.inbox_id=NEW.inbox_id AND a.cycle_id<>NEW.cycle_id)
 BEGIN SELECT RAISE(ABORT,'Current pixel-bound owner vote and separate rights admission required'); END;
CREATE TRIGGER cycle_admission_no_update BEFORE UPDATE ON editorial_cycle_admissions
 BEGIN SELECT RAISE(ABORT,'Admission audit is immutable'); END;
CREATE TRIGGER cycle_admission_no_delete BEFORE DELETE ON editorial_cycle_admissions
 BEGIN SELECT RAISE(ABORT,'Admission audit must be retained'); END;
CREATE VIEW editorial_cycle_ready_images AS
 SELECT DISTINCT a.cycle_id,a.inbox_id,a.image_id,i.type,i.created_at
 FROM editorial_cycle_admissions a JOIN editorial_review_effective_images q ON q.id=a.inbox_id
 JOIN images i ON i.id=a.image_id
 WHERE q.status='approved' AND q.revision=a.review_revision AND q.sha256=a.image_sha256
 AND i.sha256=q.sha256 AND i.type=q.origin AND i.status='approved' AND i.demo=0
 AND EXISTS(SELECT 1 FROM editorial_review_inbox_events e WHERE e.image_id=q.id
   AND e.revision=q.revision AND e.image_sha256=q.sha256 AND e.decision='approved');
CREATE TRIGGER cycle_publication_current BEFORE INSERT ON publication_batches
 WHEN EXISTS(SELECT 1 FROM json_each(NEW.image_ids) j
   WHERE EXISTS(SELECT 1 FROM editorial_cycle_admissions a WHERE a.image_id=j.value)
   AND NOT EXISTS(SELECT 1 FROM editorial_cycle_ready_images r WHERE r.image_id=j.value))
 BEGIN SELECT RAISE(ABORT,'Cycle approval changed: refresh admission before publication'); END;
CREATE TRIGGER cycle_published_review_stable BEFORE UPDATE OF status,revision ON editorial_review_inbox
 WHEN EXISTS(SELECT 1 FROM editorial_cycle_admissions a JOIN published_images p ON p.image_id=a.image_id WHERE a.inbox_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'Published cycle review is immutable'); END;
