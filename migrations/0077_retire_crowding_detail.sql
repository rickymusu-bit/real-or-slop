-- Retire crowding/detail configuration. Previously paid observations and their context history stay private,
-- attached to their images and deleted with them. No current API reads or writes real_measures.
ALTER TABLE galleries DROP COLUMN max_crowdedness;
ALTER TABLE galleries DROP COLUMN max_detail;
DELETE FROM app_settings WHERE key IN ('crowdedness_threshold','detail_threshold');
