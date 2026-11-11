-- v1.0.0, 2026-11-11T09:30:00Z: docs/database-immagini.v1.0.0.md. Additive.
-- Owner decision of 2026-11-11: an edit to a published photo takes effect only after every game that includes it has
-- ended. Games therefore keep what they were given when they started: each single-player round records the caption and
-- the game copy it serves, and each PvP challenge records its images and copies. A copy taken out of the game bucket
-- while games still use it waits in «retired_copies» and is deleted once they have ended.
-- Statistics (views, correct answers) count only rounds played with the image's current copy: regenerating a SLOP
-- gives it a new copy and so resets them.
ALTER TABLE game_rounds ADD COLUMN caption TEXT;
ALTER TABLE game_rounds ADD COLUMN copy_key TEXT;
UPDATE game_rounds SET caption=(SELECT caption FROM images WHERE images.id=game_rounds.image_id),
 copy_key=(SELECT copy_key FROM images WHERE images.id=game_rounds.image_id);
CREATE INDEX game_rounds_copy ON game_rounds(copy_key);

ALTER TABLE challenge_answers ADD COLUMN copy_key TEXT;
UPDATE challenge_answers SET copy_key=(SELECT copy_key FROM images WHERE images.id=challenge_answers.image_id);
CREATE INDEX challenge_answers_image ON challenge_answers(image_id);

CREATE TABLE challenge_images (
 challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
 image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
 copy_key TEXT NOT NULL,
 PRIMARY KEY(challenge_id, image_id)
);
CREATE INDEX challenge_images_image ON challenge_images(image_id);

CREATE TABLE retired_copies (
 copy_key TEXT PRIMARY KEY,
 image_id TEXT NOT NULL,
 retired_at TEXT NOT NULL
);
