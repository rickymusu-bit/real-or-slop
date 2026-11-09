"""v1.0.0, 2026-11-09T14:30:00Z: migration 0033, proposals removed with definitively deleted photos."""
from pathlib import Path
import sqlite3
import unittest

class DeletedPhotoProposalsSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:'); self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name < '0033': self.db.executescript(path.read_text())
        self.db.executescript(Path('scripts/seed.sql').read_text())
        tables = [r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before = {t: self.db.execute('SELECT * FROM '+t).fetchall() for t in tables}
        self.db.executescript(Path('migrations/0033_deleted_photo_proposals.v1.0.0.sql').read_text())
        self.assertEqual(before, {t: self.db.execute('SELECT * FROM '+t).fetchall() for t in tables})  # additive
        x = self.db.execute
        x("INSERT INTO editorial_workspace_topics(id,title,normalized_key,created_at) VALUES('t','Test lot title','test lot title','d')")
        x("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES('q','REAL',?,'k','{}','d')", ('a'*64,))
        x("INSERT INTO editorial_workspace_proposals(id,topic_id,kind,source_url,inbox_id,note,created_at) VALUES('link','t','link','https://commons.wikimedia.org/wiki/File:A.jpg',NULL,'','d')")
        x("INSERT INTO editorial_workspace_acquisitions(proposal_id,inbox_id,source_json,created_at) VALUES('link','q','{}','d')")
    def snapshot(self):
        self.db.execute("INSERT INTO editorial_deleted_photo_proposals VALUES('link','q','t','link','u','', 'd','d')")
    def test_proposal_survives_without_a_deletion_mark(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'definitively deleted'): self.snapshot()
        self.db.execute("DELETE FROM editorial_workspace_acquisitions")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'retained'): self.db.execute("DELETE FROM editorial_workspace_proposals WHERE id='link'")
    def test_deleted_photo_takes_its_proposal_with_it(self):
        self.db.execute("UPDATE editorial_review_inbox SET status='rejected',revision=1 WHERE id='q'")
        self.db.execute("INSERT INTO editorial_review_deleted_images VALUES('q','REAL',?,1,'owner','d')", ('a'*64,))
        self.snapshot()
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'retained'):  # the acquisition link must go first
            self.db.execute("DELETE FROM editorial_workspace_proposals WHERE id='link'")
        self.db.execute("DELETE FROM editorial_workspace_acquisitions")
        self.db.execute("DELETE FROM editorial_workspace_proposals WHERE id='link'")
        self.db.execute("DELETE FROM editorial_review_inbox WHERE id='q'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM editorial_deleted_photo_proposals").fetchone()[0], 1)
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'immutable'): self.db.execute("DELETE FROM editorial_deleted_photo_proposals")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'immutable'): self.db.execute("UPDATE editorial_deleted_photo_proposals SET note='x'")

    def test_owner_may_bring_a_deleted_photo_back_but_archives_stay_deleted(self):
        x = self.db.execute  # a photo really rejected and deleted, as the Worker does it
        x("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,status,revision,created_at) VALUES('old','REAL',?,'k0','{}','rejected',1,'d')", ('b'*64,))
        x("INSERT INTO editorial_review_deleted_images VALUES('old','REAL',?,1,'owner','d')", ('b'*64,))
        x("DELETE FROM editorial_review_inbox WHERE id='old'")
        insert = "INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'REAL',?,?,'{}','d')"
        count = lambda: self.db.execute("SELECT count(*) FROM editorial_review_inbox WHERE sha256=?", ('b'*64,)).fetchone()[0]
        self.db.execute(insert, ('attempt-legacy', 'b'*64, 'k1')); self.assertEqual(count(), 0)  # automatic sync: ignored
        self.db.execute(insert, ('old', 'c'*64, 'k2'))  # same id as a deleted one: ignored
        self.assertEqual(self.db.execute("SELECT count(*) FROM editorial_review_inbox WHERE id='old'").fetchone()[0], 0)
        self.db.execute(insert, ('owner-again', 'b'*64, 'k3')); self.assertEqual(count(), 1)  # owner upload: allowed

if __name__ == '__main__': unittest.main()
