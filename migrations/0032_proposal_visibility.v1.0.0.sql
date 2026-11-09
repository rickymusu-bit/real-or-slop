-- v1.0.0, 2026-11-09T07:50:00Z: reversible dismissal of link proposals (docs/lotti-editoriali.v1.5.2.md, 2.1).
-- Additive. Dismissals of 0029 stay as they are; from now on every dismiss or restore is an
-- append-only event and the latest event decides. A proposal is hidden when its latest event is
-- 'dismiss' or, with no event yet, when it has a 0029 dismissal. Registering a dismissed link
-- again restores it, so a link can no longer become invisible and impossible to re-add.
CREATE TABLE editorial_workspace_proposal_visibility (
 id TEXT PRIMARY KEY,
 proposal_id TEXT NOT NULL REFERENCES editorial_workspace_proposals(id),
 action TEXT NOT NULL CHECK(action IN ('dismiss','restore')),
 reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=300),
 seq INTEGER NOT NULL CHECK(seq>0),
 created_at TEXT NOT NULL,
 UNIQUE(proposal_id,seq)
);
CREATE TRIGGER editorial_proposal_visibility_only_unacquired_links BEFORE INSERT ON editorial_workspace_proposal_visibility
 WHEN NEW.action='dismiss' AND (
  NOT EXISTS(SELECT 1 FROM editorial_workspace_proposals p WHERE p.id=NEW.proposal_id AND p.kind='link' AND p.inbox_id IS NULL)
  OR EXISTS(SELECT 1 FROM editorial_workspace_acquisitions a WHERE a.proposal_id=NEW.proposal_id))
 BEGIN SELECT RAISE(ABORT,'Only unacquired link proposals can be dismissed'); END;
CREATE TRIGGER editorial_proposal_visibility_no_update BEFORE UPDATE ON editorial_workspace_proposal_visibility
 BEGIN SELECT RAISE(ABORT,'Proposal visibility history is immutable'); END;
-- Same rule as 0030: rows go only with their lot, after its append-only removal snapshot.
CREATE TRIGGER editorial_proposal_visibility_no_delete BEFORE DELETE ON editorial_workspace_proposal_visibility
 WHEN NOT EXISTS(SELECT 1 FROM editorial_workspace_proposals p JOIN editorial_lot_removals r ON r.topic_id=p.topic_id
  WHERE p.id=OLD.proposal_id AND p.kind='link' AND p.inbox_id IS NULL)
 BEGIN SELECT RAISE(ABORT,'Proposal visibility history is immutable'); END;
