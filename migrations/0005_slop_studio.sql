-- Private editorial plans. No public difficulty enum or existing data changes.
CREATE TABLE slop_plans (
 id TEXT PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=1),
 plan_json TEXT NOT NULL CHECK(json_valid(plan_json) AND json_type(plan_json)='object' AND json_type(plan_json,'$.schema_version')='integer' AND COALESCE(json_extract(plan_json,'$.schema_version'),0)=1),
 template_version TEXT NOT NULL,
 template_prompt TEXT NOT NULL,
 image_id TEXT UNIQUE REFERENCES images(id),
 reviewer TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE slop_plan_events (
 id TEXT PRIMARY KEY NOT NULL,
 plan_id TEXT NOT NULL REFERENCES slop_plans(id),
 revision INTEGER NOT NULL CHECK(revision>=1),
 action TEXT NOT NULL CHECK(action IN ('created','updated','imported')),
 reviewer TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 before_json TEXT NOT NULL CHECK(json_valid(before_json)),
 after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 created_at TEXT NOT NULL,
 UNIQUE(plan_id,revision)
);
CREATE TRIGGER slop_events_no_update BEFORE UPDATE ON slop_plan_events
 BEGIN SELECT RAISE(ABORT,'Studio history is immutable'); END;
CREATE TRIGGER slop_events_no_delete BEFORE DELETE ON slop_plan_events
 BEGIN SELECT RAISE(ABORT,'Studio history is immutable'); END;
