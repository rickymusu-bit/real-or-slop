-- Record every file before deleting gallery records, so R2 cleanup can be retried after a failure.
CREATE TABLE gallery_files_to_delete (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 bucket TEXT NOT NULL CHECK(bucket IN ('quarantine','game')),
 object_key TEXT NOT NULL
);
CREATE INDEX gallery_files_to_delete_bucket ON gallery_files_to_delete(bucket,id);

CREATE TRIGGER delete_gallery_contents BEFORE DELETE ON galleries
BEGIN
 INSERT INTO gallery_files_to_delete(bucket,object_key)
   SELECT 'quarantine',original_key FROM images WHERE gallery_id=OLD.id AND original_key<>''
   UNION SELECT 'quarantine',copy_key FROM images WHERE gallery_id=OLD.id AND copy_key IS NOT NULL
   UNION SELECT 'game',copy_key FROM images WHERE gallery_id=OLD.id AND copy_key IS NOT NULL
   UNION SELECT 'game',copy_key FROM retired_copies WHERE image_id IN (SELECT id FROM images WHERE gallery_id=OLD.id)
   UNION SELECT 'quarantine',a.candidate_key FROM slop_attempts a
     JOIN slop_processes p ON p.id=a.process_id JOIN slop_batches b ON b.id=p.batch_id
     WHERE b.gallery_id=OLD.id AND a.candidate_key IS NOT NULL;
 DELETE FROM retired_copies WHERE image_id IN (SELECT id FROM images WHERE gallery_id=OLD.id);
 DELETE FROM images WHERE gallery_id=OLD.id;
 DELETE FROM slop_batches WHERE gallery_id=OLD.id;
END;
