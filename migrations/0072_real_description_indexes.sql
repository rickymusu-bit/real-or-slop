CREATE INDEX images_real_subject_brand ON images(gallery_id, json_extract(visual_description, '$.subject.keys.brand'))
  WHERE origin='REAL' AND status<>'trash' AND visual_description IS NOT NULL;
CREATE INDEX images_real_subject_family ON images(gallery_id, json_extract(visual_description, '$.subject.keys.family'))
  WHERE origin='REAL' AND status<>'trash' AND visual_description IS NOT NULL;
CREATE INDEX images_real_subject_model ON images(gallery_id, json_extract(visual_description, '$.subject.keys.model'))
  WHERE origin='REAL' AND status<>'trash' AND visual_description IS NOT NULL;

CREATE TABLE real_environment_vectors (
  image_id TEXT PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  embedding TEXT NOT NULL CHECK(json_valid(embedding) AND json_type(embedding)='array')
);

CREATE TRIGGER real_environment_invalidate AFTER UPDATE OF visual_description ON images
  WHEN json_extract(OLD.visual_description, '$.sections.environment') IS NOT json_extract(NEW.visual_description, '$.sections.environment')
  BEGIN
    DELETE FROM real_environment_vectors WHERE image_id=NEW.id;
  END;
