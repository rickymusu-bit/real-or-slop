-- Additive #64 completion. Original semantic revisions and model receipts survive edits.
CREATE TABLE editorial_topic_semantic_history AS SELECT * FROM editorial_topic_semantics WHERE 0;
CREATE TRIGGER editorial_semantic_archive BEFORE UPDATE OF description,input_text,input_sha256,model,template_version
ON editorial_topic_semantics WHEN OLD.input_sha256!=NEW.input_sha256 OR OLD.model!=NEW.model OR OLD.template_version!=NEW.template_version
BEGIN
 INSERT INTO editorial_topic_semantic_history SELECT * FROM editorial_topic_semantics WHERE topic_id=OLD.topic_id;
END;
CREATE TRIGGER editorial_semantic_history_no_update BEFORE UPDATE ON editorial_topic_semantic_history
BEGIN SELECT RAISE(ABORT,'semantic history is immutable'); END;
CREATE TRIGGER editorial_semantic_history_no_delete BEFORE DELETE ON editorial_topic_semantic_history
BEGIN SELECT RAISE(ABORT,'semantic history is immutable'); END;

CREATE TABLE editorial_topic_suggestion_semantics (
 topic_id TEXT PRIMARY KEY REFERENCES editorial_topic_suggestions(id),
 description TEXT NOT NULL CHECK(length(description)<=500),
 input_text TEXT NOT NULL, input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64),
 template_version TEXT NOT NULL, model TEXT NOT NULL,
 embedding_status TEXT NOT NULL CHECK(embedding_status IN ('pending','submitting','ready','uncertain','failed')),
 dimensions INTEGER, vector_json TEXT CHECK(vector_json IS NULL OR json_valid(vector_json)),
 input_tokens INTEGER, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK((embedding_status='ready' AND vector_json IS NOT NULL AND dimensions>0) OR
       (embedding_status!='ready' AND vector_json IS NULL))
);
CREATE TABLE editorial_topic_suggestion_screening (
 suggestion_id TEXT PRIMARY KEY REFERENCES editorial_topic_suggestions(id),
 operation_id TEXT NOT NULL, slot INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','duplicate','uncertain')),
 novelty REAL, neighbors_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(neighbors_json)),
 reason TEXT NOT NULL DEFAULT '', UNIQUE(operation_id,slot)
);
CREATE TABLE editorial_image_relevance (
 inbox_id TEXT NOT NULL, sha256 TEXT NOT NULL, topic_id TEXT NOT NULL REFERENCES editorial_workspace_topics(id),
 topic_sha256 TEXT NOT NULL, assessment_json TEXT NOT NULL CHECK(json_valid(assessment_json)),
 model TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(inbox_id,sha256,topic_id,topic_sha256)
);
ALTER TABLE editorial_topic_explorations ADD COLUMN diagnostics_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(diagnostics_json));
-- Atomic workspace capacity, including concurrent/uncertain image calls.
CREATE TABLE editorial_workspace_generation_claims (
 topic_id TEXT NOT NULL REFERENCES editorial_workspace_topics(id), slot INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('reserved','completed','uncertain','failed')),
 created_at TEXT NOT NULL, PRIMARY KEY(topic_id,slot)
);
CREATE TABLE editorial_workspace_manual_stage (
 topic_id TEXT PRIMARY KEY REFERENCES editorial_workspace_topics(id),
 decision TEXT NOT NULL CHECK(decision IN ('finished','skip')),
 decided_at TEXT NOT NULL
);
