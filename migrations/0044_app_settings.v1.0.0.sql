-- v1.0.0, 2026-11-12T11:00:00Z: docs/statistiche-impostazioni.v1.0.0.md. Additive.
-- Values the owner sets in the dashboard Settings besides the models (table «settings», migration 0039): the default quality of
-- the image model, the two thresholds of the SLOP studio and the longest time a game counts as open. Missing rows mean the
-- defaults written in the code (50 REAL, 10 REAL per theme, 24 hours, quality «medium»).
CREATE TABLE app_settings (
 key TEXT PRIMARY KEY CHECK(key IN ('image_quality','slop_section_min_real','slop_theme_min_real','open_game_hours')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 40),
 updated_at TEXT NOT NULL
);
