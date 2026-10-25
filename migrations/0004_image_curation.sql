-- Additive and private: legacy images need no curation row or backfill.
CREATE TABLE image_curation (
 image_id TEXT PRIMARY KEY NOT NULL REFERENCES images(id),
 subject_kind TEXT CHECK(subject_kind IN ('fotografia_storica','arte_scultura','architettura','infrastruttura','trasporti','scienza_natura','personaggi','cinema_locandine','altro')),
 country_or_region TEXT CHECK(country_or_region IN ('europa','africa','asia','america_nord','america_centro_sud','oceania','antartide','multiregionale')),
 period_bucket TEXT CHECK(period_bucket IN ('prima_1800','1800_1899','1900_1945','1946_1999','2000_oggi','multiperiodo')),
 image_medium TEXT CHECK(image_medium IN ('foto_colori','foto_bn','dipinto','scultura','poster','stampa','riproduzione','altro')),
 composition TEXT CHECK(composition IN ('ritratto','scena_ampia','dettaglio','still_life','altro')),
 familiarity TEXT CHECK(familiarity IN ('alta','media','bassa')),
 perceived_plausibility TEXT CHECK(perceived_plausibility IN ('ordinaria','sorprendente','molto_insolita')),
 cognitive_mechanism TEXT CHECK(cognitive_mechanism IN ('osservazione','inferenza_temporale','confronto_oggetti','aspettative_tecnologiche','aspettative_epoca_paese','effetto_autorita','chronology_device','chronology_person','engineering_anachronism','architecture_context','fictional_artifact','fictional_event','fictional_work','visual_inconsistency','false_familiarity','altro')),
 quality_bucket TEXT CHECK(quality_bucket IN ('alta','media','bassa')),
 authenticity_confidence TEXT CHECK(authenticity_confidence IN ('da_verificare','documentata','incerta')),
 represented_country TEXT CHECK(length(represented_country)<=200),
 represented_place TEXT CHECK(length(represented_place)<=300),
 represented_period TEXT CHECK(length(represented_period)<=200),
 verified_place TEXT CHECK(length(verified_place)<=300),
 verified_date TEXT CHECK(length(verified_date)<=200),
 fact_evidence TEXT CHECK(length(fact_evidence)<=4000),
 visual_style TEXT CHECK(length(visual_style)<=300),
 surprise_reason TEXT CHECK(length(surprise_reason)<=2000),
 reveal_learning_point TEXT CHECK(length(reveal_learning_point)<=2000),
 reviewer_notes TEXT CHECK(length(reviewer_notes)<=4000),
 revision INTEGER NOT NULL CHECK(revision>=1),
 reviewer TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((verified_place IS NULL AND verified_date IS NULL) OR length(trim(COALESCE(fact_evidence,'')))>0)
);
CREATE TABLE image_curation_events (
 id TEXT PRIMARY KEY NOT NULL,
 image_id TEXT NOT NULL REFERENCES images(id),
 revision INTEGER NOT NULL CHECK(revision>=1),
 reviewer TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 before_json TEXT NOT NULL CHECK(json_valid(before_json)),
 after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 created_at TEXT NOT NULL,
 UNIQUE(image_id,revision)
);
CREATE TRIGGER curation_events_no_update BEFORE UPDATE ON image_curation_events
 BEGIN SELECT RAISE(ABORT,'Editorial history is immutable'); END;
CREATE TRIGGER curation_events_no_delete BEFORE DELETE ON image_curation_events
 BEGIN SELECT RAISE(ABORT,'Editorial history is immutable'); END;
