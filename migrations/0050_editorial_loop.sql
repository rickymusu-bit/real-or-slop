-- Private REAL description, persistent credibility loop, additive; no paid backfill or legacy batch conversion.
ALTER TABLE images ADD COLUMN real_description TEXT;
ALTER TABLE images ADD COLUMN real_description_provenance TEXT;
ALTER TABLE images ADD COLUMN commons_description TEXT;
ALTER TABLE slop_batches ADD COLUMN pipeline_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE slop_batches ADD COLUMN loop_settings TEXT;
CREATE TABLE slop_processes (
 id TEXT PRIMARY KEY,
 batch_id TEXT NOT NULL REFERENCES slop_batches(id) ON DELETE CASCADE,
 slot INTEGER NOT NULL,
 source_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
 image_id TEXT REFERENCES images(id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'draft',
 brief TEXT, brief_hash TEXT, prompt TEXT NOT NULL DEFAULT '',
 snapshot TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(batch_id,slot)
);
CREATE UNIQUE INDEX slop_process_source ON slop_processes(source_id)
 WHERE state IN ('running','retry');
CREATE TABLE slop_attempts (
 id TEXT PRIMARY KEY,
 process_id TEXT NOT NULL REFERENCES slop_processes(id) ON DELETE CASCADE,
 number INTEGER NOT NULL, prompt TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 candidate_key TEXT, evaluation TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(process_id,number)
);
CREATE TABLE paid_calls_0050 (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('analysis','prompts','images','evaluation')),
 model TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','completed','uncertain','failed')),
 input_tokens INTEGER, output_tokens INTEGER,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
 process_id TEXT REFERENCES slop_processes(id) ON DELETE SET NULL,
 attempt_id TEXT REFERENCES slop_attempts(id) ON DELETE SET NULL
);
INSERT INTO paid_calls_0050(id,kind,model,status,input_tokens,output_tokens,created_at,updated_at)
 SELECT id,kind,model,status,input_tokens,output_tokens,created_at,updated_at FROM paid_calls;
DROP TABLE paid_calls;
ALTER TABLE paid_calls_0050 RENAME TO paid_calls;
CREATE INDEX paid_calls_created ON paid_calls(created_at,status);
CREATE TABLE app_settings_0050 (
 key TEXT PRIMARY KEY CHECK(key IN ('image_quality','slop_section_min_real','slop_group_min_real','open_game_hours',
  'slop_auto_enabled','slop_auto_threshold_percent','max_generation_attempts','editorial_tolerance')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 40), updated_at TEXT NOT NULL
);
INSERT INTO app_settings_0050 SELECT * FROM app_settings;
DROP TABLE app_settings;
ALTER TABLE app_settings_0050 RENAME TO app_settings;

-- Approved 4:5 transition (spec copie-di-gioco, section 7). Keep every original/copy and the rounds already assigned;
-- withdraw older published formats for owner reframing. Existing retirement maintenance removes only unused game-bucket copies.
INSERT OR IGNORE INTO retired_copies(copy_key,image_id,retired_at)
 SELECT copy_key,id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM images
 WHERE status='published' AND copy_key IS NOT NULL
 AND CASE WHEN json_valid(copy_crop) THEN COALESCE(json_extract(copy_crop,'$.format'),'') ELSE '' END <> '4:5';
UPDATE images SET status='approved',published_at=NULL,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE status='published'
 AND CASE WHEN json_valid(copy_crop) THEN COALESCE(json_extract(copy_crop,'$.format'),'') ELSE '' END <> '4:5';
