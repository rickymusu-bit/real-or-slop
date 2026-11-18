-- The source stays private once its SLOP reaches the library. Approval is recorded even if the SLOP later goes to trash.
CREATE VIEW slop_source_states AS
 SELECT u.source_id, CASE
   WHEN u.image_id IS NULL THEN 'pending'
   WHEN child.approved_at IS NULL THEN 'unapproved'
   ELSE 'approved'
 END AS state
 FROM slop_reference_uses u LEFT JOIN images child ON child.id=u.image_id;

-- Retain the published copy for games that already took it. The usual sweep will remove it when safe.
CREATE TRIGGER slop_source_withdraw AFTER UPDATE OF image_id ON slop_reference_uses
 WHEN NEW.image_id IS NOT NULL AND OLD.image_id IS NULL
 BEGIN
 INSERT INTO retired_copies(copy_key,image_id,retired_at)
 SELECT copy_key,id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM images WHERE id=NEW.source_id AND status='published' AND copy_key IS NOT NULL
 ON CONFLICT(copy_key) DO NOTHING;
 UPDATE images SET status='approved',published_at=NULL,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=NEW.source_id AND status='published';
 END;

-- Apply the same withdrawal to the links already recorded by migration 0055.
INSERT INTO retired_copies(copy_key,image_id,retired_at)
 SELECT i.copy_key,i.id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM images i JOIN slop_reference_uses u ON u.source_id=i.id
 WHERE u.image_id IS NOT NULL AND i.status='published' AND i.copy_key IS NOT NULL
 ON CONFLICT(copy_key) DO NOTHING;
UPDATE images SET status='approved',published_at=NULL,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE status='published' AND id IN (SELECT source_id FROM slop_reference_uses WHERE image_id IS NOT NULL);
