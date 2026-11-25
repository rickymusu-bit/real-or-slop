-- Extend the already published preview schema without changing applied migration 0073.
ALTER TABLE pipeline_jobs ADD COLUMN format TEXT;
DROP INDEX pipeline_active_source;
CREATE UNIQUE INDEX pipeline_active_source ON pipeline_jobs(source_id)
 WHERE state IN ('queued','dispatching','working','proposal','candidate','review','accepting');
