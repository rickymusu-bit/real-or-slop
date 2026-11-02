-- Computed preparation is separate from the final human approval.
CREATE TABLE editorial_preparations (
 image_id TEXT PRIMARY KEY REFERENCES images(id),
 token TEXT NOT NULL,
 ready INTEGER NOT NULL CHECK(ready IN (0,1)),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 features_json TEXT NOT NULL CHECK(json_valid(features_json)),
 blockers_json TEXT NOT NULL CHECK(json_valid(blockers_json)),
 prepared_at TEXT NOT NULL
);
CREATE TABLE editorial_feedback (
 event_id TEXT PRIMARY KEY REFERENCES review_events(id),
 image_id TEXT NOT NULL UNIQUE REFERENCES images(id),
 decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
 features_json TEXT NOT NULL CHECK(json_valid(features_json)),
 preparation_token TEXT NOT NULL,
 model_version TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TRIGGER feedback_no_update BEFORE UPDATE ON editorial_feedback BEGIN SELECT RAISE(ABORT,'Editorial feedback is immutable'); END;
CREATE TRIGGER feedback_no_delete BEFORE DELETE ON editorial_feedback BEGIN SELECT RAISE(ABORT,'Editorial feedback is immutable'); END;
CREATE TRIGGER preparation_image_changed AFTER UPDATE ON images BEGIN DELETE FROM editorial_preparations WHERE image_id=NEW.id; END;
CREATE TRIGGER preparation_source_changed AFTER UPDATE ON sources BEGIN DELETE FROM editorial_preparations WHERE image_id IN (SELECT id FROM images WHERE source_id=NEW.id); END;
CREATE TRIGGER preparation_license_changed AFTER UPDATE ON licenses BEGIN DELETE FROM editorial_preparations WHERE image_id IN (SELECT id FROM images WHERE license_id=NEW.id); END;
CREATE TRIGGER preparation_categories_added AFTER INSERT ON image_categories BEGIN DELETE FROM editorial_preparations WHERE image_id=NEW.image_id; END;
CREATE TRIGGER preparation_categories_removed AFTER DELETE ON image_categories BEGIN DELETE FROM editorial_preparations WHERE image_id=OLD.image_id; END;
CREATE TRIGGER preparation_curation_added AFTER INSERT ON image_curation BEGIN DELETE FROM editorial_preparations WHERE image_id=NEW.image_id; END;
CREATE TRIGGER preparation_curation_changed AFTER UPDATE ON image_curation BEGIN DELETE FROM editorial_preparations WHERE image_id=NEW.image_id; END;
CREATE TRIGGER feedback_matches_review BEFORE INSERT ON editorial_feedback
BEGIN SELECT RAISE(ABORT,'Feedback requires its human review event') WHERE NOT EXISTS(
 SELECT 1 FROM review_events WHERE id=NEW.event_id AND image_id=NEW.image_id AND decision=NEW.decision
); END;
CREATE TRIGGER preparation_curation_removed AFTER DELETE ON image_curation BEGIN DELETE FROM editorial_preparations WHERE image_id=OLD.image_id; END;
CREATE TRIGGER preparation_categories_changed AFTER UPDATE ON image_categories BEGIN DELETE FROM editorial_preparations WHERE image_id IN (OLD.image_id,NEW.image_id); END;
