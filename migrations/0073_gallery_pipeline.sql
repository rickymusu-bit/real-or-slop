-- Private gallery pipeline; jobs retain source links only while pending owner decisions.
ALTER TABLE images ADD COLUMN pipeline_profile TEXT;
ALTER TABLE images ADD COLUMN pipeline_scene TEXT;
ALTER TABLE galleries ADD COLUMN pipeline_settings TEXT;
CREATE TABLE pipeline_jobs (
 id TEXT PRIMARY KEY,
 gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
 source_id TEXT REFERENCES images(id) ON DELETE CASCADE,
 state TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 proposal TEXT,
 evaluation TEXT,
 candidate_key TEXT,
 previous_key TEXT,
 image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
 request TEXT,
 error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX pipeline_active_source ON pipeline_jobs(source_id) WHERE state IN ('queued','working','proposal','candidate','review','accepting');
CREATE INDEX pipeline_jobs_gallery ON pipeline_jobs(gallery_id,created_at);
CREATE TRIGGER pipeline_job_files BEFORE DELETE ON pipeline_jobs BEGIN
 INSERT INTO gallery_files_to_delete(bucket,object_key) SELECT 'quarantine',OLD.candidate_key WHERE OLD.candidate_key IS NOT NULL;
 INSERT INTO gallery_files_to_delete(bucket,object_key) SELECT 'quarantine',OLD.previous_key WHERE OLD.previous_key IS NOT NULL;
 INSERT INTO gallery_files_to_delete(bucket,object_key) SELECT 'quarantine',json_extract(OLD.snapshot,'$.correction.maskKey') WHERE json_extract(OLD.snapshot,'$.correction.maskKey') IS NOT NULL;
END;
