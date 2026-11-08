-- v1.0.0, 2026-11-08T20:00:26Z: editorial lots (docs/lotti-editoriali.v1.3.1.md), phase 1.
-- Additive only: existing topics remain the lot identity; no historical row is rewritten.
-- A topic without a row here is an open lot whose notes default to its semantic description.
CREATE TABLE editorial_lots (
 topic_id TEXT PRIMARY KEY REFERENCES editorial_workspace_topics(id),
 notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=500),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 closed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
-- Append-only history of owner edits to lot notes.
CREATE TABLE editorial_lot_events (
 id TEXT PRIMARY KEY,
 topic_id TEXT NOT NULL REFERENCES editorial_workspace_topics(id),
 kind TEXT NOT NULL CHECK(kind IN ('notes')),
 value TEXT NOT NULL CHECK(length(value)<=500),
 revision INTEGER NOT NULL CHECK(revision>0),
 created_at TEXT NOT NULL,
 UNIQUE(topic_id,kind,revision)
);
CREATE TRIGGER editorial_lot_events_no_update BEFORE UPDATE ON editorial_lot_events
 BEGIN SELECT RAISE(ABORT,'Lot history is immutable'); END;
-- Proposals stay immutable (0019); dismissing an unusable link only hides it.
CREATE TABLE editorial_workspace_proposal_dismissals (
 proposal_id TEXT PRIMARY KEY REFERENCES editorial_workspace_proposals(id),
 reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=300),
 created_at TEXT NOT NULL
);
CREATE TRIGGER editorial_proposal_dismissal_only_unacquired_links BEFORE INSERT ON editorial_workspace_proposal_dismissals
 WHEN NOT EXISTS(SELECT 1 FROM editorial_workspace_proposals p WHERE p.id=NEW.proposal_id AND p.kind='link' AND p.inbox_id IS NULL)
  OR EXISTS(SELECT 1 FROM editorial_workspace_acquisitions a WHERE a.proposal_id=NEW.proposal_id)
 BEGIN SELECT RAISE(ABORT,'Only unacquired link proposals can be dismissed'); END;
CREATE TRIGGER editorial_proposal_dismissal_no_update BEFORE UPDATE ON editorial_workspace_proposal_dismissals
 BEGIN SELECT RAISE(ABORT,'Proposal dismissals are immutable'); END;
CREATE TRIGGER editorial_proposal_dismissal_no_delete BEFORE DELETE ON editorial_workspace_proposal_dismissals
 BEGIN SELECT RAISE(ABORT,'Proposal dismissals are immutable'); END;
