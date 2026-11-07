-- Admin-only owner topic workspace. No user account, player data, paid calls or publication.
-- Additive to existing editorial inbox and audit; links are proposals, not verified REAL.
CREATE TABLE editorial_workspace_topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 6 AND 200),
  normalized_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE editorial_workspace_proposals (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES editorial_workspace_topics(id),
  kind TEXT NOT NULL CHECK(kind IN ('link','upload')),
  source_url TEXT,
  inbox_id TEXT UNIQUE,
  note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=1000),
  created_at TEXT NOT NULL,
  CHECK ((kind='link' AND source_url IS NOT NULL AND inbox_id IS NULL) OR
         (kind='upload' AND source_url IS NULL AND inbox_id IS NOT NULL)),
  UNIQUE(topic_id,source_url)
);
CREATE INDEX editorial_workspace_proposals_topic ON editorial_workspace_proposals(topic_id,created_at);
CREATE TRIGGER editorial_workspace_topic_identity BEFORE UPDATE OF id,title,normalized_key,created_at ON editorial_workspace_topics
BEGIN SELECT RAISE(ABORT,'Topic identity is immutable'); END;
CREATE TRIGGER editorial_workspace_proposal_immutable BEFORE UPDATE ON editorial_workspace_proposals
BEGIN SELECT RAISE(ABORT,'Manual submission audit is immutable'); END;
CREATE TRIGGER editorial_workspace_proposal_no_delete BEFORE DELETE ON editorial_workspace_proposals
BEGIN SELECT RAISE(ABORT,'Manual submission audit must be retained'); END;
