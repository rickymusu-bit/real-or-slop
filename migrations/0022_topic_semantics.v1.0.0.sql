-- v1.0.0: embed every newly supplied owner topic, independent of Topic Discovery.
-- Never manufacture a vector or pretend indexing succeeded when API/budget is missing.
CREATE TABLE editorial_topic_semantics (
  topic_id TEXT PRIMARY KEY REFERENCES editorial_workspace_topics(id),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=500),
  input_text TEXT NOT NULL,
  input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64),
  template_version TEXT NOT NULL,
  model TEXT NOT NULL,
  embedding_status TEXT NOT NULL CHECK(embedding_status IN ('pending','submitting','ready','uncertain','failed')),
  dimensions INTEGER,
  vector_json TEXT CHECK(vector_json IS NULL OR json_valid(vector_json)),
  input_tokens INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((embedding_status='ready' AND vector_json IS NOT NULL AND dimensions>0)
        OR (embedding_status!='ready' AND vector_json IS NULL))
);
CREATE INDEX editorial_topic_semantics_status ON editorial_topic_semantics(embedding_status,updated_at);
