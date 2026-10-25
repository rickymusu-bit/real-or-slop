-- pending uploads do not have a content hash yet.
CREATE UNIQUE INDEX image_content_hash ON images(sha256) WHERE sha256 <> 'pending';
