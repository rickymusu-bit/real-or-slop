from pathlib import Path
import json
import hashlib
import sqlite3
import unittest


class CycleSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name<'0018':self.db.executescript(path.read_text())
        self.db.executescript(Path('scripts/seed.sql').read_text())
        self.db.executescript(Path('scripts/seed-publication.sql').read_text())
        tables=[r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before={t:self.db.execute('SELECT * FROM '+t).fetchall() for t in tables}
        self.db.executescript(Path('migrations/0018_editorial_cycle_admission.sql').read_text())
        self.assertEqual(before,{t:self.db.execute('SELECT * FROM '+t).fetchall() for t in tables})
    def candidate(self,uid,origin='REAL',vote=True):
        sha=hashlib.sha256(uid.encode()).hexdigest()
        self.db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,status,revision,created_at) VALUES(?,?,?,'pixels','{}','approved',1,'date')",(uid,origin,sha))
        if vote:self.db.execute("INSERT INTO editorial_review_inbox_events VALUES(?,?,1,'owner','approved',?,'Personal vote','date')",('vote-'+uid,uid,sha))
        self.db.execute("INSERT INTO images(id,type,title,description,author,authenticity_evidence,r2_key,sha256,explanation,status,demo,rights_verified_at,ai_model,ai_prompt) VALUES(?,?,'Title','','Author','Evidence',?,?,'Explanation','approved',0,'date','fixture-model','fixture prompt')",(uid,origin,'file-'+uid,sha))
        self.db.execute("INSERT INTO review_events VALUES(?,?,'owner','approved','Separate rights','date')",('rights-'+uid,uid))
        return sha
    def admit(self,uid,sha,**kwargs):
        attestation=dict(rights_confirmed=True,authenticity_confirmed=True,**kwargs)
        self.db.execute('INSERT INTO editorial_cycle_admissions VALUES(?,?,?,?,?,?,?,?,?)',('admit-'+uid,'test-cycle',uid,uid,sha,1,json.dumps(attestation),'owner','date'))
    def test_current_pixel_vote_and_separate_rights_are_both_required(self):
        sha=self.candidate('missing-vote',vote=False)
        with self.assertRaises(sqlite3.IntegrityError):self.admit('missing-vote',sha)
        self.assertEqual(self.db.execute('SELECT count(*) FROM editorial_cycle_admissions').fetchone()[0],0)
        sha=self.candidate('one')
        with self.assertRaises(sqlite3.IntegrityError):self.admit('one','f'*64)
        self.db.execute("UPDATE images SET rights_verified_at=NULL WHERE id='one'")
        with self.assertRaises(sqlite3.IntegrityError):self.admit('one',sha)
        self.db.execute("UPDATE images SET rights_verified_at='date' WHERE id='one'")
        self.admit('one',sha)
        self.assertEqual(self.db.execute('SELECT count(*) FROM editorial_cycle_ready_images').fetchone()[0],1)
        for command in ('DELETE FROM editorial_cycle_admissions',"UPDATE editorial_cycle_admissions SET cycle_id='other'"):
            with self.assertRaises(sqlite3.IntegrityError):self.db.execute(command)
    def test_stale_admission_cannot_be_published_even_by_direct_sql(self):
        for uid,origin in [('real','REAL'),('slop','AI')]:self.admit(uid,self.candidate(uid,origin))
        self.db.execute("UPDATE editorial_review_inbox SET status='rejected',revision=2 WHERE id='slop'")
        self.assertEqual(self.db.execute('SELECT count(*) FROM editorial_cycle_ready_images').fetchone()[0],1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO publication_batches VALUES('blocked','[\"real\",\"slop\"]','owner','date')")
        self.assertEqual(self.db.execute("SELECT count(*) FROM published_images WHERE image_id IN ('real','slop')").fetchone()[0],0)
    def test_published_reviews_and_catalog_stay_stable(self):
        for uid,origin in [('real','REAL'),('slop','AI')]:self.admit(uid,self.candidate(uid,origin))
        self.db.execute("INSERT INTO publication_batches VALUES('okay','[\"real\",\"slop\"]','owner','date')")
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE editorial_review_inbox SET status='rejected',revision=2 WHERE id='real'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM published_images WHERE batch_id='okay'").fetchone()[0],2)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
