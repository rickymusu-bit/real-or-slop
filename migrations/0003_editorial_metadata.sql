ALTER TABLE images ADD COLUMN generation_date TEXT;
ALTER TABLE images ADD COLUMN owner_declaration INTEGER NOT NULL DEFAULT 0 CHECK(owner_declaration IN (0,1));
CREATE VIEW image_answer_statistics AS
 SELECT r.image_id,a.correct FROM answers a JOIN game_rounds r ON r.id=a.round_id
 UNION ALL
 SELECT image_id,correct FROM challenge_answers;
