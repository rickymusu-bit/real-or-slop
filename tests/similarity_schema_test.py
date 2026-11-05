from pathlib import Path
import sqlite3
import unittest


class SimilaritySchemaTest(unittest.TestCase):
    def test_current_pairs_follow_frames_and_history_remains_immutable(self):
        db = sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):
            db.executescript(path.read_text())
        for uid, sha in [('a', 'a'*64), ('b', 'b'*64)]:
            db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'REAL',?,'private/key','{}','date')", (uid, sha))
        db.execute("INSERT INTO similarity_pairs(id,a,b,a_sha256,b_sha256,model,reason,created_at) VALUES('pair','a','b',?,?,'test','visual','date')", ('a'*64, 'b'*64))
        self.assertEqual(db.execute('SELECT count(*) FROM similarity_current_pairs').fetchone()[0], 1)
        db.execute("INSERT INTO similarity_events VALUES('event','pair',1,'different',?,?,'owner','Two locations','date')", ('a'*64, 'b'*64))
        for sql in ('DELETE FROM similarity_events', "UPDATE similarity_events SET decision='same_scene'"):
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(sql)
        # A changed effective presentation must invalidate earlier judgments.
        db.execute("UPDATE editorial_review_inbox SET status='approved'")
        metadata = '{"normalization":{"owner_requested":true,"approved_source_sha256":"'+ 'a'*64 +'","crop_decision":{"preserves_context":true,"needs_review":false}},"profile_image_sha256":"'+ 'c'*64 +'"}'
        db.execute("INSERT INTO editorial_review_presentations VALUES('a',?,0,?,'new/frame',1024,1024,?,'date')", ('a'*64, 'c'*64, metadata))
        self.assertEqual(db.execute('SELECT count(*) FROM similarity_current_pairs').fetchone()[0], 0)
        self.assertEqual(db.execute('SELECT count(*) FROM similarity_events').fetchone()[0], 1)

    def test_upgrade_is_additive(self):
        db = sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name < '0017': db.executescript(path.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        before = db.execute('SELECT * FROM images').fetchall()
        db.executescript(Path('migrations/0017_image_similarity.sql').read_text())
        self.assertEqual(db.execute('SELECT * FROM images').fetchall(), before)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
