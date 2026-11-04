from pathlib import Path
import sqlite3
import unittest

class ReviewInboxSchemaTest(unittest.TestCase):
    def test_upgrade_preserves_existing_rows_and_protects_images_and_history(self):
        db=sqlite3.connect(':memory:')
        for p in sorted(Path('migrations').glob('*.sql')):
            if p.name<'0014':db.executescript(p.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        db.executescript(Path('scripts/seed-publication.sql').read_text())
        tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before={t:db.execute('SELECT * FROM '+t).fetchall() for t in tables}
        db.executescript(Path('migrations/0014_unified_review_inbox.sql').read_text())
        self.assertEqual(before,{t:db.execute('SELECT * FROM '+t).fetchall() for t in tables})
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES('one','AI',?,'private/key','{}','date')",('a'*64,))
        db.execute("INSERT INTO editorial_review_inbox_events VALUES('event','one',1,'owner','approved',?,'Good composition','date')",('a'*64,))
        for sql in ("DELETE FROM editorial_review_inbox", "UPDATE editorial_review_inbox SET sha256='other'", "DELETE FROM editorial_review_inbox_events", "UPDATE editorial_review_inbox_events SET decision='rejected'"):
            with self.subTest(sql=sql),self.assertRaises(sqlite3.IntegrityError):db.execute(sql)
        db.execute("UPDATE editorial_review_inbox SET status='approved',revision=1")
        self.assertEqual(before,{t:db.execute('SELECT * FROM '+t).fetchall() for t in tables})

class ReviewDeletionSchemaTest(unittest.TestCase):
    def upgraded(self):
        db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
        for p in sorted(Path('migrations').glob('*.sql')):
            if p.name<'0015':db.executescript(p.read_text())
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,status,revision,created_at) VALUES('one','AI',?,'private/key','{}','rejected',2,'date')",('a'*64,))
        db.execute("INSERT INTO editorial_review_inbox_events VALUES('first','one',1,'owner','approved',?,'Original choice','date')",('a'*64,))
        db.execute("INSERT INTO editorial_review_inbox_events VALUES('second','one',2,'owner','rejected',?,'Changed mind','date')",('a'*64,))
        before=db.execute('SELECT * FROM editorial_review_inbox_events').fetchall()
        db.executescript(Path('migrations/0015_rejected_review_deletion.sql').read_text())
        self.assertEqual(before,db.execute('SELECT * FROM editorial_review_inbox_events').fetchall())
        return db,before

    def test_hard_deletion_keeps_judgments_and_blocks_reimport_even_under_another_id(self):
        db,before=self.upgraded()
        with self.assertRaises(sqlite3.IntegrityError):db.execute("DELETE FROM editorial_review_inbox WHERE id='one'")
        db.execute("INSERT INTO editorial_review_deleted_images VALUES('one','AI',?,2,'owner','date')",('a'*64,))
        db.execute("DELETE FROM editorial_review_inbox WHERE id='one'")
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_inbox').fetchone()[0],0)
        self.assertEqual(before,db.execute('SELECT * FROM editorial_review_inbox_events').fetchall())
        for uid in ('one','another-id'):
            db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'AI',?,'private/key','{}','date')",(uid,'a'*64))
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_inbox').fetchone()[0],0)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        for sql in ('DELETE FROM editorial_review_deleted_images','DELETE FROM editorial_review_inbox_events'):
            with self.assertRaises(sqlite3.IntegrityError):db.execute(sql)

    def test_pending_approved_and_stale_images_cannot_be_marked_for_deletion(self):
        for state,revision in [('pending',2),('approved',2),('rejected',1)]:
            with self.subTest(state=state,revision=revision):
                db,_=self.upgraded();db.execute('UPDATE editorial_review_inbox SET status=?',(state,))
                with self.assertRaises(sqlite3.IntegrityError):db.execute("INSERT INTO editorial_review_deleted_images VALUES('one','AI',?,?,'owner','date')",('a'*64,revision))
                self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_inbox').fetchone()[0],1)
