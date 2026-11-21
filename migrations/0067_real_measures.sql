-- Owner decisions of 2026-11-21: a model measures crowding and detail of a REAL on request (paid, confirmed), to see how hard the photo
-- would be for an image generator. Every measure is kept, with model and context version, and goes with its photo. Each gallery may
-- have its own thresholds; the defaults are settings. Generation of SLOP is unchanged.
CREATE TABLE real_measures (
 id TEXT PRIMARY KEY,
 image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
 model TEXT NOT NULL,
 base_context TEXT NOT NULL,
 measure_context TEXT NOT NULL,
 observation TEXT NOT NULL CHECK(json_valid(observation)),
 crowdedness INTEGER NOT NULL CHECK(crowdedness BETWEEN 0 AND 100),
 detail INTEGER NOT NULL CHECK(detail BETWEEN 0 AND 100),
 created_at TEXT NOT NULL
);
CREATE INDEX real_measures_image ON real_measures(image_id, created_at);
-- NULL: the default of the settings.
ALTER TABLE galleries ADD COLUMN max_crowdedness INTEGER CHECK(max_crowdedness BETWEEN 0 AND 100);
ALTER TABLE galleries ADD COLUMN max_detail INTEGER CHECK(max_detail BETWEEN 0 AND 100);

-- The instructions of the measure are a part of the model context, with versions. No foreign key points at model_contexts.
CREATE TABLE model_contexts_0067 (
 id TEXT PRIMARY KEY,
 part TEXT NOT NULL CHECK(part IN ('base','analysis','slop_prompt','slop_evaluation','slop_gallery_prompt','real_measure')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL,
 pipeline INTEGER NOT NULL DEFAULT 2 CHECK(pipeline IN (1,2))
);
INSERT INTO model_contexts_0067 SELECT id,part,body,created_at,pipeline FROM model_contexts ORDER BY rowid;
DROP TABLE model_contexts;
ALTER TABLE model_contexts_0067 RENAME TO model_contexts;
CREATE INDEX model_contexts_part ON model_contexts(part, created_at);

-- Default thresholds are settings. No foreign key points at app_settings, so the table is rebuilt with every row.
CREATE TABLE app_settings_0067 (
 key TEXT PRIMARY KEY CHECK(key IN ('image_quality','open_game_hours','max_generation_attempts','editorial_tolerance','commons_checks_per_night',
   'crowdedness_threshold','detail_threshold')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 40), updated_at TEXT NOT NULL
);
INSERT INTO app_settings_0067 SELECT key,value,updated_at FROM app_settings;
DROP TABLE app_settings;
ALTER TABLE app_settings_0067 RENAME TO app_settings;
