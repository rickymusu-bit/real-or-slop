-- Game catalog mode defaults to the established demo on first deployment.
-- A mode change affects new sessions only; published images are not modified.
CREATE TABLE game_catalog_control (
 id INTEGER PRIMARY KEY CHECK(id=1),
 mode TEXT NOT NULL CHECK(mode IN ('demo','production')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at TEXT NOT NULL
);
INSERT INTO game_catalog_control(id,mode,revision,updated_at)
 VALUES(1,'demo',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE game_catalog_mode_events (
 id TEXT PRIMARY KEY,
 previous_mode TEXT NOT NULL CHECK(previous_mode IN ('demo','production')),
 mode TEXT NOT NULL CHECK(mode IN ('demo','production')),
 revision INTEGER NOT NULL UNIQUE CHECK(revision>0),
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TRIGGER game_catalog_control_no_delete BEFORE DELETE ON game_catalog_control
 BEGIN SELECT RAISE(ABORT,'Catalog control cannot be removed'); END;
CREATE TRIGGER game_catalog_events_no_update BEFORE UPDATE ON game_catalog_mode_events
 BEGIN SELECT RAISE(ABORT,'Catalog mode audit is immutable'); END;
CREATE TRIGGER game_catalog_events_no_delete BEFORE DELETE ON game_catalog_mode_events
 BEGIN SELECT RAISE(ABORT,'Catalog mode audit is immutable'); END;
