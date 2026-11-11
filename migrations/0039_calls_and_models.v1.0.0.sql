-- v1.0.0, 2026-11-10T22:11:48Z: docs/wizard-slop.v1.4.0.md, section 12. Owner decision of 2026-11-10: «togli i prezzi e il calcolo
-- del costo, tieni solo i selettori dei modelli»; the dollar budget goes with them. Paid calls are still confirmed one
-- by one and recorded (model, tokens, outcome); an uncertain outcome is never resent; the spending limit that counts is
-- the one set on the OpenAI project.
-- The register «spend» becomes «paid_calls», without amounts, and also accepts prompt and image calls (phase 3).
CREATE TABLE paid_calls (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('analysis','prompts','images')),
 model TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','completed','uncertain','failed')),
 input_tokens INTEGER,
 output_tokens INTEGER,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
INSERT INTO paid_calls(id,kind,model,status,input_tokens,output_tokens,created_at,updated_at)
 SELECT id, CASE kind WHEN 'generation' THEN 'images' ELSE kind END, model, CASE status WHEN 'reserved' THEN 'pending' ELSE status END,
  input_tokens, output_tokens, created_at, updated_at FROM spend;
CREATE INDEX paid_calls_created ON paid_calls(created_at, status);
DROP TABLE spend;
DROP TABLE budget;

-- Models chosen in the dashboard Settings: one for text (tags, captions, SLOP prompts), one for images.
CREATE TABLE settings (
 key TEXT PRIMARY KEY CHECK(key IN ('text_model','image_model')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 100),
 updated_at TEXT NOT NULL
);
