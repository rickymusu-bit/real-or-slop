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

if __name__ == '__main__': unittest.main()
