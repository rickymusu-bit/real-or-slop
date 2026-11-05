-- v4.0.0, additive/private. No backfill of legacy tags, votes or captions.
CREATE TABLE editorial_matrix_cells (id TEXT PRIMARY KEY, emotion TEXT NOT NULL, topic TEXT NOT NULL, taxonomy_version TEXT NOT NULL CHECK(taxonomy_version='4.0.0'), UNIQUE(emotion,topic));
CREATE TABLE editorial_matrix_briefs (
 id TEXT PRIMARY KEY CHECK(length(id)=64), brief_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 intent_cell TEXT NOT NULL REFERENCES editorial_matrix_cells(id), body_json TEXT NOT NULL CHECK(json_valid(body_json)), frozen_at TEXT NOT NULL
);
CREATE TABLE editorial_matrix_candidates (
 candidate_id TEXT PRIMARY KEY REFERENCES editorial_review_inbox(id), image_sha256 TEXT NOT NULL CHECK(length(image_sha256)=64),
 origin TEXT NOT NULL CHECK(origin IN ('REAL','AI')), brief_ref TEXT NOT NULL REFERENCES editorial_matrix_briefs(id),
 observed_cell TEXT NOT NULL REFERENCES editorial_matrix_cells(id), provider TEXT NOT NULL, batch TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE editorial_matrix_events (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('proposal','review','classification','attempt')),
 origin TEXT NOT NULL CHECK(origin IN ('REAL','AI')), intent_cell TEXT NOT NULL REFERENCES editorial_matrix_cells(id),
 observed_cell TEXT NOT NULL REFERENCES editorial_matrix_cells(id), candidate_id TEXT, image_sha256 TEXT,
 brief_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=0), decision TEXT CHECK(decision IN ('approved','rejected','pending')),
 provider TEXT NOT NULL, batch TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json)), created_at TEXT NOT NULL,
 UNIQUE(kind,candidate_id,revision)
);
CREATE INDEX matrix_events_cell ON editorial_matrix_events(intent_cell,origin,created_at);
CREATE INDEX matrix_events_candidate ON editorial_matrix_events(candidate_id,kind,revision);
CREATE TRIGGER matrix_candidate_bind BEFORE INSERT ON editorial_matrix_candidates BEGIN
 SELECT RAISE(ABORT,'Final candidate pixels or origin mismatch') WHERE NOT EXISTS(SELECT 1 FROM editorial_review_effective_images q WHERE q.id=NEW.candidate_id AND q.sha256=NEW.image_sha256 AND q.origin=NEW.origin);
END;
CREATE TRIGGER matrix_candidate_proposal AFTER INSERT ON editorial_matrix_candidates BEGIN
 INSERT INTO editorial_matrix_events SELECT 'proposal:'||NEW.candidate_id,'proposal',NEW.origin,b.intent_cell,NEW.observed_cell,NEW.candidate_id,NEW.image_sha256,b.brief_id,0,NULL,NEW.provider,NEW.batch,'{}',NEW.created_at FROM editorial_matrix_briefs b WHERE b.id=NEW.brief_ref;
 -- Binding an already-reviewed picture retains its actual owner history.
 INSERT INTO editorial_matrix_events SELECT 'review:'||e.id,'review',NEW.origin,b.intent_cell,NEW.observed_cell,NEW.candidate_id,NEW.image_sha256,b.brief_id,e.revision,e.decision,NEW.provider,NEW.batch,json_object('note',e.note),e.created_at FROM editorial_review_inbox_events e JOIN editorial_matrix_briefs b ON b.id=NEW.brief_ref WHERE e.image_id=NEW.candidate_id AND e.image_sha256=NEW.image_sha256;
END;
CREATE TRIGGER matrix_owner_feedback AFTER INSERT ON editorial_review_inbox_events BEGIN
 INSERT INTO editorial_matrix_events SELECT 'review:'||NEW.id,'review',c.origin,b.intent_cell,c.observed_cell,c.candidate_id,c.image_sha256,b.brief_id,NEW.revision,NEW.decision,c.provider,c.batch,json_object('note',NEW.note),NEW.created_at FROM editorial_matrix_candidates c JOIN editorial_matrix_briefs b ON b.id=c.brief_ref WHERE c.candidate_id=NEW.image_id AND c.image_sha256=NEW.image_sha256;
END;
CREATE TRIGGER matrix_candidate_retain BEFORE DELETE ON editorial_review_inbox WHEN EXISTS(SELECT 1 FROM editorial_matrix_candidates WHERE candidate_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Matrix images and refusals must be retained'); END;
CREATE TABLE editorial_game_bindings (candidate_id TEXT PRIMARY KEY REFERENCES editorial_matrix_candidates(candidate_id), image_id TEXT NOT NULL UNIQUE REFERENCES images(id));
CREATE TRIGGER matrix_game_bind BEFORE INSERT ON editorial_game_bindings BEGIN
 SELECT RAISE(ABORT,'Legacy publication needs explicit owner review before a new matrix binding') WHERE EXISTS(SELECT 1 FROM published_images WHERE image_id=NEW.image_id) AND NOT EXISTS(SELECT 1 FROM editorial_review_inbox WHERE id=NEW.candidate_id AND status='approved');
 SELECT RAISE(ABORT,'Game image differs from reviewed final pixels') WHERE NOT EXISTS(SELECT 1 FROM images i JOIN editorial_matrix_candidates c ON c.candidate_id=NEW.candidate_id WHERE i.id=NEW.image_id AND i.sha256=c.image_sha256 AND i.type=c.origin AND i.demo=0);
END;
CREATE TABLE editorial_game_captions (
 candidate_id TEXT NOT NULL REFERENCES editorial_matrix_candidates(candidate_id), revision INTEGER NOT NULL CHECK(revision>0),
 image_sha256 TEXT NOT NULL CHECK(length(image_sha256)=64), game_caption TEXT NOT NULL CHECK(length(game_caption) BETWEEN 1 AND 120),
 dossier_json TEXT NOT NULL CHECK(json_valid(dossier_json)), created_at TEXT NOT NULL, PRIMARY KEY(candidate_id,revision)
);
CREATE TRIGGER caption_final_pixels BEFORE INSERT ON editorial_game_captions BEGIN
 SELECT RAISE(ABORT,'Caption is not bound to candidate pixels') WHERE NOT EXISTS(SELECT 1 FROM editorial_matrix_candidates c WHERE c.candidate_id=NEW.candidate_id AND c.image_sha256=NEW.image_sha256);
 SELECT RAISE(ABORT,'Caption revision must be consecutive') WHERE NEW.revision<>COALESCE((SELECT max(revision)+1 FROM editorial_game_captions WHERE candidate_id=NEW.candidate_id),1);
END;
CREATE TABLE editorial_caption_reviews (
 id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, caption_revision INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 decision TEXT NOT NULL CHECK(decision IN ('approved','rejected','pending')), reviewer TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,
 FOREIGN KEY(candidate_id,caption_revision) REFERENCES editorial_game_captions(candidate_id,revision),UNIQUE(candidate_id,caption_revision,revision)
);
CREATE VIEW editorial_caption_current AS SELECT c.*,COALESCE(r.decision,'draft') AS status,r.created_at AS reviewed_at,COALESCE(r.revision,0) AS review_revision
 FROM editorial_game_captions c LEFT JOIN editorial_caption_reviews r ON r.candidate_id=c.candidate_id AND r.caption_revision=c.revision
 AND r.revision=(SELECT max(revision) FROM editorial_caption_reviews WHERE candidate_id=c.candidate_id AND caption_revision=c.revision);
CREATE VIEW editorial_public_captions AS SELECT b.image_id,c.game_caption,c.revision,json_extract(c.dossier_json,'$.caption_context_fictional') AS fictional,c.image_sha256
 FROM editorial_game_bindings b JOIN editorial_caption_current c ON c.candidate_id=b.candidate_id JOIN images i ON i.id=b.image_id AND i.sha256=c.image_sha256
 WHERE c.status='approved' AND c.revision=(SELECT max(revision) FROM editorial_caption_current WHERE candidate_id=c.candidate_id AND status='approved');
CREATE VIEW editorial_v4_publication_ready AS SELECT b.image_id FROM editorial_game_bindings b
 JOIN editorial_matrix_candidates m ON m.candidate_id=b.candidate_id JOIN editorial_review_inbox q ON q.id=m.candidate_id
 JOIN editorial_caption_current c ON c.candidate_id=m.candidate_id
 WHERE q.status='approved' AND c.status='approved' AND c.revision=(SELECT max(revision) FROM editorial_game_captions WHERE candidate_id=m.candidate_id)
 AND c.image_sha256=m.image_sha256;
CREATE TRIGGER matrix_publication_gate BEFORE INSERT ON published_images WHEN EXISTS(SELECT 1 FROM editorial_game_bindings WHERE image_id=NEW.image_id)
 BEGIN SELECT RAISE(ABORT,'Image and latest caption require independent owner approval') WHERE NOT EXISTS(SELECT 1 FROM editorial_v4_publication_ready WHERE image_id=NEW.image_id); END;
-- Immutable pre-answer text is assigned once. Legacy sessions keep NULL.
ALTER TABLE game_rounds ADD COLUMN game_caption TEXT;
ALTER TABLE game_rounds ADD COLUMN caption_revision INTEGER;
ALTER TABLE game_rounds ADD COLUMN caption_context_fictional INTEGER;
CREATE TRIGGER round_caption_immutable BEFORE UPDATE OF game_caption,caption_revision,caption_context_fictional ON game_rounds
 BEGIN SELECT RAISE(ABORT,'Assigned caption is immutable'); END;
INSERT INTO editorial_matrix_cells VALUES('wonder:people_everyday_life','wonder','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:animals','wonder','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:food_cooking','wonder','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:travel_landscapes','wonder','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:homes_architecture','wonder','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:fashion_beauty_lifestyle','wonder','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:products_consumption','wonder','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:arts_crafts','wonder','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:sports_entertainment','wonder','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:news_current_affairs','wonder','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:science_technology','wonder','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('wonder:history_archives','wonder','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:people_everyday_life','tenderness','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:animals','tenderness','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:food_cooking','tenderness','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:travel_landscapes','tenderness','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:homes_architecture','tenderness','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:fashion_beauty_lifestyle','tenderness','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:products_consumption','tenderness','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:arts_crafts','tenderness','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:sports_entertainment','tenderness','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:news_current_affairs','tenderness','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:science_technology','tenderness','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('tenderness:history_archives','tenderness','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:people_everyday_life','compassion','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:animals','compassion','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:food_cooking','compassion','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:travel_landscapes','compassion','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:homes_architecture','compassion','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:fashion_beauty_lifestyle','compassion','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:products_consumption','compassion','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:arts_crafts','compassion','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:sports_entertainment','compassion','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:news_current_affairs','compassion','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:science_technology','compassion','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('compassion:history_archives','compassion','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:people_everyday_life','outrage','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:animals','outrage','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:food_cooking','outrage','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:travel_landscapes','outrage','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:homes_architecture','outrage','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:fashion_beauty_lifestyle','outrage','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:products_consumption','outrage','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:arts_crafts','outrage','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:sports_entertainment','outrage','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:news_current_affairs','outrage','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:science_technology','outrage','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('outrage:history_archives','outrage','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:people_everyday_life','fear','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:animals','fear','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:food_cooking','fear','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:travel_landscapes','fear','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:homes_architecture','fear','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:fashion_beauty_lifestyle','fear','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:products_consumption','fear','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:arts_crafts','fear','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:sports_entertainment','fear','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:news_current_affairs','fear','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:science_technology','fear','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('fear:history_archives','fear','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:people_everyday_life','disgust','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:animals','disgust','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:food_cooking','disgust','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:travel_landscapes','disgust','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:homes_architecture','disgust','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:fashion_beauty_lifestyle','disgust','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:products_consumption','disgust','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:arts_crafts','disgust','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:sports_entertainment','disgust','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:news_current_affairs','disgust','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:science_technology','disgust','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('disgust:history_archives','disgust','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:people_everyday_life','desire','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:animals','desire','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:food_cooking','desire','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:travel_landscapes','desire','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:homes_architecture','desire','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:fashion_beauty_lifestyle','desire','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:products_consumption','desire','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:arts_crafts','desire','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:sports_entertainment','desire','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:news_current_affairs','desire','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:science_technology','desire','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('desire:history_archives','desire','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:people_everyday_life','nostalgia','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:animals','nostalgia','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:food_cooking','nostalgia','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:travel_landscapes','nostalgia','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:homes_architecture','nostalgia','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:fashion_beauty_lifestyle','nostalgia','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:products_consumption','nostalgia','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:arts_crafts','nostalgia','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:sports_entertainment','nostalgia','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:news_current_affairs','nostalgia','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:science_technology','nostalgia','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('nostalgia:history_archives','nostalgia','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:people_everyday_life','amusement','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:animals','amusement','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:food_cooking','amusement','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:travel_landscapes','amusement','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:homes_architecture','amusement','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:fashion_beauty_lifestyle','amusement','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:products_consumption','amusement','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:arts_crafts','amusement','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:sports_entertainment','amusement','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:news_current_affairs','amusement','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:science_technology','amusement','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('amusement:history_archives','amusement','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:people_everyday_life','curiosity','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:animals','curiosity','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:food_cooking','curiosity','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:travel_landscapes','curiosity','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:homes_architecture','curiosity','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:fashion_beauty_lifestyle','curiosity','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:products_consumption','curiosity','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:arts_crafts','curiosity','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:sports_entertainment','curiosity','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:news_current_affairs','curiosity','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:science_technology','curiosity','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('curiosity:history_archives','curiosity','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:people_everyday_life','admiration','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:animals','admiration','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:food_cooking','admiration','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:travel_landscapes','admiration','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:homes_architecture','admiration','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:fashion_beauty_lifestyle','admiration','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:products_consumption','admiration','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:arts_crafts','admiration','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:sports_entertainment','admiration','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:news_current_affairs','admiration','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:science_technology','admiration','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('admiration:history_archives','admiration','history_archives','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:people_everyday_life','neutrality','people_everyday_life','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:animals','neutrality','animals','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:food_cooking','neutrality','food_cooking','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:travel_landscapes','neutrality','travel_landscapes','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:homes_architecture','neutrality','homes_architecture','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:fashion_beauty_lifestyle','neutrality','fashion_beauty_lifestyle','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:products_consumption','neutrality','products_consumption','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:arts_crafts','neutrality','arts_crafts','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:sports_entertainment','neutrality','sports_entertainment','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:news_current_affairs','neutrality','news_current_affairs','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:science_technology','neutrality','science_technology','4.0.0');
INSERT INTO editorial_matrix_cells VALUES('neutrality:history_archives','neutrality','history_archives','4.0.0');
CREATE TRIGGER editorial_matrix_cells_update_blocked BEFORE UPDATE ON editorial_matrix_cells BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_matrix_cells_delete_blocked BEFORE DELETE ON editorial_matrix_cells BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_matrix_briefs_update_blocked BEFORE UPDATE ON editorial_matrix_briefs BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_matrix_briefs_delete_blocked BEFORE DELETE ON editorial_matrix_briefs BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_matrix_candidates_update_blocked BEFORE UPDATE ON editorial_matrix_candidates BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_matrix_candidates_delete_blocked BEFORE DELETE ON editorial_matrix_candidates BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_matrix_events_update_blocked BEFORE UPDATE ON editorial_matrix_events BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_matrix_events_delete_blocked BEFORE DELETE ON editorial_matrix_events BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_game_bindings_update_blocked BEFORE UPDATE ON editorial_game_bindings BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_game_bindings_delete_blocked BEFORE DELETE ON editorial_game_bindings BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_game_captions_update_blocked BEFORE UPDATE ON editorial_game_captions BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_game_captions_delete_blocked BEFORE DELETE ON editorial_game_captions BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_caption_reviews_update_blocked BEFORE UPDATE ON editorial_caption_reviews BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TRIGGER editorial_caption_reviews_delete_blocked BEFORE DELETE ON editorial_caption_reviews BEGIN SELECT RAISE(ABORT,'Editorial v4 history is immutable'); END;
CREATE TABLE editorial_matrix_reports (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('brief_variety','visual_variety')), version TEXT NOT NULL, report_json TEXT NOT NULL CHECK(json_valid(report_json)),created_at TEXT NOT NULL);
CREATE TRIGGER matrix_report_no_update BEFORE UPDATE ON editorial_matrix_reports BEGIN SELECT RAISE(ABORT,'Variety report is immutable'); END;
CREATE TRIGGER matrix_report_no_delete BEFORE DELETE ON editorial_matrix_reports BEGIN SELECT RAISE(ABORT,'Variety report is retained'); END;
