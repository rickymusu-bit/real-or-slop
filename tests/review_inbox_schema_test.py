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
