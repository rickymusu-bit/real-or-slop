-- Private fingerprints and image-bound editorial decisions. No source image,
-- prior review, publication, label, or historical game is rewritten.
CREATE TABLE similarity_features (
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 model TEXT NOT NULL,
 dhash TEXT NOT NULL CHECK(length(dhash)=16),
 embedding_json TEXT NOT NULL CHECK(json_valid(embedding_json) AND json_array_length(embedding_json)=384),
 created_at TEXT NOT NULL,
 PRIMARY KEY(sha256,model)
);
CREATE TABLE similarity_pairs (
 id TEXT PRIMARY KEY,
 a TEXT NOT NULL, b TEXT NOT NULL CHECK(a<b),
 a_sha256 TEXT NOT NULL CHECK(length(a_sha256)=64),
 b_sha256 TEXT NOT NULL CHECK(length(b_sha256)=64),
 model TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('exact','perceptual','visual','manual')),
 cosine REAL, distance INTEGER,
 decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','different','same_scene','prefer_a','prefer_b')),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(a,b,a_sha256,b_sha256,model)
);
CREATE INDEX similarity_pair_queue ON similarity_pairs(decision,reason,cosine);
CREATE TRIGGER similarity_pair_identity_immutable BEFORE UPDATE OF id,a,b,a_sha256,b_sha256,model ON similarity_pairs
 BEGIN SELECT RAISE(ABORT,'Similarity pair identity is immutable'); END;
CREATE TABLE similarity_events (
 id TEXT PRIMARY KEY, pair_id TEXT NOT NULL REFERENCES similarity_pairs(id),
 revision INTEGER NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('pending','different','same_scene','prefer_a','prefer_b')),
 a_sha256 TEXT NOT NULL, b_sha256 TEXT NOT NULL,
 reviewer TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(pair_id,revision)
);
CREATE TRIGGER similarity_event_no_update BEFORE UPDATE ON similarity_events
 BEGIN SELECT RAISE(ABORT,'Similarity history is immutable'); END;
CREATE TRIGGER similarity_event_no_delete BEFORE DELETE ON similarity_events
 BEGIN SELECT RAISE(ABORT,'Similarity history is retained'); END;
CREATE TABLE similarity_categories (
 asset_id TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id),
 PRIMARY KEY(asset_id,category_id)
);
CREATE TABLE similarity_indexed_assets (
 asset_id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, model TEXT NOT NULL,
 indexed_at TEXT NOT NULL
);

-- Published images remain visible; private archives use their effective frame.
-- Preserve a private identity when publication later adds the same bytes.
CREATE VIEW similarity_assets AS
 SELECT q.id,q.sha256,q.origin,q.media_key,'QUARANTINE' AS store,
   COALESCE(json_extract(q.metadata_json,'$.title'),'Immagine archiviata') AS title,
   q.status,q.metadata_json
 FROM editorial_review_effective_images q
 UNION ALL
 SELECT 'catalog-'||i.id,i.sha256,i.type,i.r2_key,'IMAGES',i.title,i.status,
   json_object('source_kind','image','source_id',i.id)
 FROM images i JOIN published_images p ON p.image_id=i.id
 WHERE i.demo=0 AND i.sha256<>'pending' AND NOT EXISTS(
   SELECT 1 FROM editorial_review_effective_images q WHERE q.sha256=i.sha256 AND q.origin=i.type);

CREATE VIEW similarity_asset_categories AS
 SELECT asset_id,category_id FROM similarity_categories
 UNION
 SELECT a.id,ic.category_id FROM similarity_assets a JOIN images i
   ON (i.sha256=a.sha256 AND i.type=a.origin)
   OR (json_extract(a.metadata_json,'$.source_kind')='image' AND i.id=json_extract(a.metadata_json,'$.source_id'))
   JOIN image_categories ic ON ic.image_id=i.id;

-- Decisions referring to an old presentation or a deleted image are historical.
CREATE VIEW similarity_current_pairs AS
 SELECT p.* FROM similarity_pairs p JOIN similarity_assets a ON a.id=p.a AND a.sha256=p.a_sha256
 JOIN similarity_assets b ON b.id=p.b AND b.sha256=p.b_sha256;
