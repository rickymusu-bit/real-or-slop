-- Explicit owner budget resets; reservations and uncertain receipts stay intact.
CREATE TABLE editorial_budget_periods (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 previous_id INTEGER REFERENCES editorial_budget_periods(id),
 baseline_usd REAL NOT NULL CHECK(baseline_usd>=0),
 allowance_usd REAL NOT NULL CHECK(allowance_usd>=0.000001),
 created_at TEXT NOT NULL
);
CREATE TRIGGER editorial_budget_period_no_update BEFORE UPDATE ON editorial_budget_periods
 BEGIN SELECT RAISE(ABORT,'Budget history is immutable'); END;
CREATE TRIGGER editorial_budget_period_no_delete BEFORE DELETE ON editorial_budget_periods
 BEGIN SELECT RAISE(ABORT,'Budget history is immutable'); END;
CREATE VIEW editorial_budget_current AS SELECT * FROM editorial_budget_periods ORDER BY id DESC LIMIT 1;
CREATE TABLE editorial_budget_allocations (
 usage_id TEXT PRIMARY KEY REFERENCES editorial_usage(id),
 period_id INTEGER NOT NULL REFERENCES editorial_budget_periods(id)
);
CREATE INDEX editorial_budget_allocation_period ON editorial_budget_allocations(period_id);
CREATE TRIGGER editorial_budget_allocation_no_update BEFORE UPDATE ON editorial_budget_allocations
 BEGIN SELECT RAISE(ABORT,'Budget allocations are immutable'); END;
CREATE TRIGGER editorial_budget_allocation_no_delete BEFORE DELETE ON editorial_budget_allocations
 BEGIN SELECT RAISE(ABORT,'Budget allocations are immutable'); END;
CREATE VIEW editorial_budget_usage AS
 SELECT u.* FROM editorial_usage u
 WHERE NOT EXISTS(SELECT 1 FROM editorial_budget_current) OR EXISTS(
   SELECT 1 FROM editorial_budget_allocations a
   WHERE a.usage_id=u.id AND a.period_id=(SELECT id FROM editorial_budget_current));
-- All producers share the same allowance, including legacy Batch/v2 triggers.
-- Duplicate reservation retries remain governed by their original unique IDs.
CREATE TRIGGER editorial_budget_shared_cap BEFORE INSERT ON editorial_usage
 WHEN EXISTS(SELECT 1 FROM editorial_budget_current) AND NOT EXISTS(SELECT 1 FROM editorial_usage WHERE id=NEW.id)
 BEGIN
 SELECT RAISE(ABORT,'Editorial shared budget exhausted')
 WHERE round(COALESCE((SELECT sum(reserved_usd) FROM editorial_budget_usage),0)+NEW.reserved_usd,6)>
       (SELECT allowance_usd FROM editorial_budget_current);
 END;
CREATE TRIGGER editorial_budget_allocate AFTER INSERT ON editorial_usage
 WHEN EXISTS(SELECT 1 FROM editorial_budget_current)
 BEGIN
 INSERT INTO editorial_budget_allocations(usage_id,period_id)
 SELECT NEW.id,id FROM editorial_budget_current;
 END;
