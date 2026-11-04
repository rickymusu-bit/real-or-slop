import json
from pathlib import Path
import sqlite3
import unittest

class StandardPresentationTest(unittest.TestCase):
    def db(self):
        db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
        for p in sorted(Path('migrations').glob('*.sql')):db.executescript(p.read_text())
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,status,revision,created_at) VALUES('one','REAL',?,'old/key',?,'approved',1,'date')",('a'*64,json.dumps(dict(title='Original title',profile={'previous':True}))))
        db.execute("INSERT INTO editorial_review_inbox_events VALUES('owner-vote','one',1,'owner','approved',?,'Actual source approval','date')",('a'*64,))
        return db
    def metadata(self):
        profile=json.loads(Path('tests/editorial-v2-contract.json').read_text())['profile']
        return dict(profile=profile,profile_image_sha256='b'*64,presentation=dict(width=1024,height=1024),
            normalization=dict(owner_requested=True,approved_source_sha256='a'*64,crop_decision=dict(preserves_context=True,needs_review=False)))
    def insert(self,db,meta=None,source='a'*64,revision=1):
        db.execute('INSERT INTO editorial_review_presentations VALUES(?,?,?,?,?,?,?,?,?)',('one',source,revision,'b'*64,'standard/key',1024,1024,json.dumps(meta or self.metadata()),'date'))
    def test_effective_copy_changes_pixels_and_profile_but_preserves_the_real_owner_vote(self):
        db=self.db();original=db.execute('SELECT * FROM editorial_review_inbox').fetchall();events=db.execute('SELECT * FROM editorial_review_inbox_events').fetchall()
        self.insert(db)
        sha,key,meta,status,revision,source=db.execute('SELECT sha256,media_key,metadata_json,status,revision,source_sha256 FROM editorial_review_effective_images').fetchone()
        self.assertEqual((sha,key,status,revision,source),('b'*64,'standard/key','approved',1,'a'*64))
        self.assertEqual(json.loads(meta)['profile'],self.metadata()['profile'])
        self.assertEqual(json.loads(meta)['title'],'Original title')
        self.assertEqual(original,db.execute('SELECT * FROM editorial_review_inbox').fetchall())
        self.assertEqual(events,db.execute('SELECT * FROM editorial_review_inbox_events').fetchall())
    def test_stale_rejected_or_uncertain_normalizations_are_blocked(self):
        for state,revision in [('pending',1),('rejected',1),('approved',2)]:
            with self.subTest(state=state,revision=revision):
                db=self.db();db.execute('UPDATE editorial_review_inbox SET status=?',(state,))
                with self.assertRaises(sqlite3.IntegrityError):self.insert(db,revision=revision)
        for field in ('owner_requested','review_flag','profile_sha'):
            db=self.db();m=self.metadata()
            if field=='owner_requested':m['normalization']['owner_requested']=False
            elif field=='review_flag':m['normalization']['crop_decision']['needs_review']=True
            else:m['profile_image_sha256']='c'*64
            with self.subTest(field=field),self.assertRaises(sqlite3.IntegrityError):self.insert(db,m)
    def test_deleted_normalized_image_cannot_return_as_original_or_final_pixels(self):
        db=self.db();self.insert(db)
        db.execute("UPDATE editorial_review_inbox SET status='rejected',revision=2")
        db.execute("INSERT INTO editorial_review_inbox_events VALUES('new-vote','one',2,'owner','rejected',?,'Crop reconsidered','date')",('b'*64,))
        db.execute("INSERT INTO editorial_review_deleted_images SELECT id,origin,source_sha256,revision,'owner','date' FROM editorial_review_effective_images WHERE id='one'")
        db.execute("DELETE FROM editorial_review_inbox WHERE id='one'")
        for sha in ('a'*64,'b'*64):
            db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'REAL',?,'key','{}','date')",('new-'+sha,sha))
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_inbox').fetchone()[0],0)
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_presentations').fetchone()[0],1)
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_inbox_events').fetchone()[0],2)
        self.assertFalse(db.execute('PRAGMA foreign_key_check').fetchall())

class PresentationImportTest(unittest.TestCase):
    def test_import_binds_final_rgb_pixels_and_profile_before_upload(self):
        import hashlib,importlib.util,tempfile
        from PIL import Image
        spec=importlib.util.spec_from_file_location('presentation_import','scripts/apply-review-presentations.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);path=root/'final.webp';Image.new('RGB',(1024,1024),'green').save(path,'WEBP')
            sha=hashlib.sha256(path.read_bytes()).hexdigest();meta=StandardPresentationTest().metadata();meta['profile_image_sha256']=sha
            row=dict(image_id='one',source_sha256='a'*64,source_revision=1,sha256=sha,file=str(path),media_key='review-inbox/files/'+sha,width=1024,height=1024,metadata=meta,created_at='date')
            manifest=dict(version='1.0.0',variants=[row]);rows,files=module.prepare(manifest,root)
            self.assertEqual(len(rows),1);self.assertEqual(len(files),1)
            meta['profile_image_sha256']='c'*64
            with self.assertRaises(ValueError):module.prepare(manifest,root)
    def test_import_rejects_nonstandard_dimensions(self):
        import hashlib,importlib.util,tempfile
        from PIL import Image
        spec=importlib.util.spec_from_file_location('presentation_import','scripts/apply-review-presentations.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);path=root/'final.webp';Image.new('RGB',(1024,683),'green').save(path,'WEBP')
            sha=hashlib.sha256(path.read_bytes()).hexdigest();meta=StandardPresentationTest().metadata();meta['profile_image_sha256']=sha
            row=dict(image_id='one',source_sha256='a'*64,source_revision=1,sha256=sha,file=str(path),media_key='review-inbox/files/'+sha,width=1024,height=1024,metadata=meta,created_at='date')
            with self.assertRaises(ValueError):module.prepare(dict(version='1.0.0',variants=[row]),root)
