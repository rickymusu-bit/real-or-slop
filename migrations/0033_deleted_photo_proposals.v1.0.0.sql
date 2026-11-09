-- v1.0.0, 2026-11-09T14:30:00Z: deleting a rejected photo definitively also removes its proposal
-- (docs/spazio-file.v1.2.0.md). Explicit owner decision of 2026-11-09: «se elimino la foto, deve eliminarsi
-- anche il link. Non deve rimanere tra le proposte.»
-- Additive: an append-only snapshot of each removed proposal, and the proposal delete guard extended with
-- this second allowed case. Lot removals (0030) keep working as before.
-- Second owner decision of the same day: «Se io elimino la foto, poi ho il diritto di ricaricarla, perché
-- magari l'ho caricata in un lotto sbagliato.» The deletion register stays (it authorizes deletions and stops
-- archived legacy photos from coming back through the automatic sync), but no longer blocks photos the
-- owner brings in again: uploads (owner-), Commons acquisitions (commons-) and generations (generated-).
CREATE TABLE editorial_deleted_photo_proposals (
 proposal_id TEXT PRIMARY KEY,
 inbox_id TEXT NOT NULL,
 topic_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('link','upload')),
 source_url TEXT,
 note TEXT,
 proposed_at TEXT NOT NULL,
 deleted_at TEXT NOT NULL
);
CREATE INDEX editorial_deleted_photo_proposals_inbox ON editorial_deleted_photo_proposals(inbox_id);
CREATE TRIGGER editorial_deleted_photo_proposals_marked BEFORE INSERT ON editorial_deleted_photo_proposals
 WHEN NOT EXISTS(SELECT 1 FROM editorial_review_deleted_images d WHERE d.image_id=NEW.inbox_id)
 BEGIN SELECT RAISE(ABORT,'Only proposals of definitively deleted photos are removed'); END;
CREATE TRIGGER editorial_deleted_photo_proposals_no_update BEFORE UPDATE ON editorial_deleted_photo_proposals
 BEGIN SELECT RAISE(ABORT,'Deleted proposal audit is immutable'); END;
CREATE TRIGGER editorial_deleted_photo_proposals_no_delete BEFORE DELETE ON editorial_deleted_photo_proposals
 BEGIN SELECT RAISE(ABORT,'Deleted proposal audit is immutable'); END;
DROP TRIGGER editorial_workspace_proposal_no_delete;
CREATE TRIGGER editorial_workspace_proposal_no_delete BEFORE DELETE ON editorial_workspace_proposals
 WHEN NOT (
  (OLD.kind='link' AND OLD.inbox_id IS NULL
   AND NOT EXISTS(SELECT 1 FROM editorial_workspace_acquisitions a WHERE a.proposal_id=OLD.id)
   AND EXISTS(SELECT 1 FROM editorial_lot_removals r WHERE r.topic_id=OLD.topic_id))
  OR
  (NOT EXISTS(SELECT 1 FROM editorial_workspace_acquisitions a WHERE a.proposal_id=OLD.id)
   AND EXISTS(SELECT 1 FROM editorial_deleted_photo_proposals s WHERE s.proposal_id=OLD.id)))
BEGIN SELECT RAISE(ABORT,'Manual submission audit must be retained'); END;

DROP TRIGGER review_inbox_prevent_reimport;
CREATE TRIGGER review_inbox_prevent_reimport BEFORE INSERT ON editorial_review_inbox
 WHEN EXISTS(SELECT 1 FROM editorial_review_deleted_images d WHERE d.image_id=NEW.id
   OR (NOT (NEW.id LIKE 'owner-%' OR NEW.id LIKE 'commons-%' OR NEW.id LIKE 'generated-%')
     AND d.origin=NEW.origin AND (d.sha256=NEW.sha256 OR EXISTS(
       SELECT 1 FROM editorial_review_presentations p WHERE p.image_id=d.image_id AND p.sha256=NEW.sha256))))
 BEGIN SELECT RAISE(IGNORE); END;
