-- v1.0.0, 2026-11-08: advisory model assessments, distinct from owner decisions.
CREATE TABLE editorial_topic_suggestion_assessments (
 suggestion_id TEXT PRIMARY KEY REFERENCES editorial_topic_suggestions(id),
 policy_version TEXT NOT NULL,
 description TEXT NOT NULL CHECK(length(description)<=500),
 assessment_json TEXT NOT NULL CHECK(json_valid(assessment_json)),
 status TEXT NOT NULL CHECK(status IN ('pending','eligible','ineligible','uncertain')),
 review_json TEXT CHECK(review_json IS NULL OR json_valid(review_json)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE editorial_topic_suggestion_runs (
 id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('preparing','completed','failed','uncertain')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
