-- Local synthetic catalog only; no remote publication command uses this file.
INSERT INTO publication_batches(id,image_ids,reviewer,created_at)
 SELECT 'demo-fixtures-v1',json_group_array(id),'demo-seed','2026-11-01T00:00:00Z' FROM images
 WHERE demo=1 AND status='approved' AND id NOT IN (SELECT image_id FROM published_images)
 HAVING count(*)>0;
