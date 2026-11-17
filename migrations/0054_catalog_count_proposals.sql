-- 2026-11-16: proposals depend on absolute catalogue counts, without group or percentage thresholds.
DELETE FROM slop_proposal_ignored;
ALTER TABLE slop_proposal_ignored RENAME COLUMN spread_percent TO missing_count;
DELETE FROM app_settings WHERE key IN ('slop_section_min_real','slop_auto_threshold_percent');
