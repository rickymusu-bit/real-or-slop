-- v1.0.0, 2026-11-08T21:00:00Z: owner removal of lots holding only unacquired links
-- (docs/lotti-editoriali.v1.4.0.md, section 2.2). Explicit owner request in session.
-- Proposals and dismissals stay undeletable, except link rows that were never acquired, and only
-- after an append-only removal snapshot of the same lot exists. Uploads, acquired photos,
-- review rows, paid receipts and every other audit keep their existing protections.
CREATE TABLE editorial_lot_removals (
 topic_id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 normalized_key TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 removed_at TEXT NOT NULL
);
CREATE TRIGGER editorial_lot_removals_no_update BEFORE UPDATE ON editorial_lot_removals
 BEGIN SELECT RAISE(ABORT,'Lot removal audit is immutable'); END;
CREATE TRIGGER editorial_lot_removals_no_delete BEFORE DELETE ON editorial_lot_removals
 BEGIN SELECT RAISE(ABORT,'Lot removal audit is immutable'); END;
DROP TRIGGER editorial_workspace_proposal_no_delete;
CREATE TRIGGER editorial_workspace_proposal_no_delete BEFORE DELETE ON editorial_workspace_proposals
 WHEN NOT (OLD.kind='link' AND OLD.inbox_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM editorial_workspace_acquisitions a WHERE a.proposal_id=OLD.id)
  AND EXISTS(SELECT 1 FROM editorial_lot_removals r WHERE r.topic_id=OLD.topic_id))
BEGIN SELECT RAISE(ABORT,'Manual submission audit must be retained'); END;
DROP TRIGGER editorial_proposal_dismissal_no_delete;
CREATE TRIGGER editorial_proposal_dismissal_no_delete BEFORE DELETE ON editorial_workspace_proposal_dismissals
 WHEN NOT EXISTS(SELECT 1 FROM editorial_workspace_proposals p JOIN editorial_lot_removals r ON r.topic_id=p.topic_id
  WHERE p.id=OLD.proposal_id AND p.kind='link' AND p.inbox_id IS NULL)
BEGIN SELECT RAISE(ABORT,'Proposal dismissals are immutable'); END;
