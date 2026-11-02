import json
from pathlib import Path
import sqlite3
import unittest

class ReviewSchemaTest(unittest.TestCase):
    def fixture(self):
        db=sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name < '0010': db.executescript(path.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        image=db.execute('SELECT id FROM images LIMIT 1').fetchone()[0]
        db.execute("INSERT INTO review_events VALUES('historic',?,'human','approved','original note','2026-11-01')",(image,))
        db.execute("INSERT INTO licenses VALUES('review-license','CC0','https://creativecommons.org/publicdomain/zero/1.0/','')")
        db.execute("UPDATE images SET license_id='review-license' WHERE id=?",(image,))
        db.execute("INSERT INTO categories VALUES('review-new-cat','New fixture category',NULL)")
        before=db.execute('SELECT * FROM review_events').fetchall()
        db.executescript(Path('migrations/0010_visual_editorial_review.sql').read_text())
        self.assertEqual(before,db.execute('SELECT * FROM review_events').fetchall())
        return db,image

    def test_feedback_is_exactly_once_immutable_and_requires_matching_human_decision(self):
        db,image=self.fixture()
        args=('historic',image,'approved',json.dumps(['category:arte']),'token','1.0.0','date')
        db.execute('INSERT INTO editorial_feedback VALUES(?,?,?,?,?,?,?)',args)
        for sql in ['DELETE FROM editorial_feedback',"UPDATE editorial_feedback SET decision='rejected'"]:
            with self.assertRaises(sqlite3.IntegrityError): db.execute(sql)
        with self.assertRaises(sqlite3.IntegrityError): db.execute('INSERT INTO editorial_feedback VALUES(?,?,?,?,?,?,?)',args)
        db.execute("INSERT INTO review_events VALUES('other',?,'human','approved','','date')",(image,))
        with self.assertRaises(sqlite3.IntegrityError): db.execute('INSERT INTO editorial_feedback VALUES(?,?,?,?,?,?,?)',('other',image,'rejected','[]','t','1.0.0','date'))
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_changes_invalidate_prepared_cards_without_rewriting_the_review_history(self):
        db,image=self.fixture()
        for statement,params in [
            ("UPDATE images SET explanation='new' WHERE id=?",(image,)),
            ("UPDATE licenses SET obligations='updated' WHERE id=(SELECT license_id FROM images WHERE id=?)",(image,)),
            ("INSERT INTO image_categories VALUES(?,'review-new-cat')",(image,)),
            ("DELETE FROM image_categories WHERE image_id=?",(image,)),
        ]:
            db.execute('INSERT OR REPLACE INTO editorial_preparations VALUES(?,?,?,?,?,?,?)',(image,'t',1,'{}','[]','[]','date'))
            db.execute(statement,params)
            self.assertEqual(db.execute('SELECT count(*) FROM editorial_preparations').fetchone()[0],0)
        self.assertEqual(db.execute('SELECT notes FROM review_events').fetchone()[0],'original note')
