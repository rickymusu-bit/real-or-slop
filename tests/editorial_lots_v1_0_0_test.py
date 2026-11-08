"""Schema 0029 (lots, notes history, link dismissals). v1.0.0, 2026-11-08T20:00:26Z."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ("0014_unified_review_inbox.sql", "0015_rejected_review_deletion.sql",
              "0019_editorial_workspace.v1.0.0.sql", "0020_editorial_intelligence.v1.0.0.sql",
              "0029_editorial_lots.v1.0.0.sql")

class LotSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for filename in MIGRATIONS:
            self.db.executescript((ROOT / "migrations" / filename).read_text())
        self.db.execute("INSERT INTO editorial_workspace_topics VALUES('t1','Venice canals','venice canals','now')")

    def tearDown(self):
        self.db.close()

    def proposal(self, pid, kind="link", url=None, inbox=None):
        self.db.execute("INSERT INTO editorial_workspace_proposals VALUES(?,?,?,?,?,?,?)",
                        (pid, "t1", kind, url, inbox, "", "now"))

    def test_lot_notes_are_bounded_and_history_immutable(self):
        db = self.db
        db.execute("INSERT INTO editorial_lots(topic_id,notes,created_at,updated_at) VALUES('t1','',?,?)", ("now", "now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE editorial_lots SET notes=? WHERE topic_id='t1'", ("x" * 501,))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE editorial_lots SET status='archived' WHERE topic_id='t1'")
        db.execute("INSERT INTO editorial_lot_events VALUES('e1','t1','notes','only canals',1,'now')")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE editorial_lot_events SET value='changed'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_lot_events VALUES('e2','t1','notes','again',1,'now')")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_lots(topic_id,created_at,updated_at) VALUES('missing','now','now')")

    def test_only_unacquired_links_can_be_dismissed_once_forever(self):
        db = self.db
        self.proposal("link", url="https://thumb.wikimedia.org/x.jpg")
        self.proposal("acquired", url="https://commons.wikimedia.org/wiki/File:A.jpg")
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES('i1','REAL',?,'k','{}','now')", ("a" * 64,))
        db.execute("INSERT INTO editorial_workspace_acquisitions VALUES('acquired','i1','{}','now')")
        self.proposal("upload", kind="upload", inbox="i1")
        db.execute("INSERT INTO editorial_workspace_proposal_dismissals VALUES('link','thumbnail','now')")
        for pid in ("acquired", "upload", "missing"):
            with self.assertRaises(sqlite3.IntegrityError, msg=pid):
                db.execute("INSERT INTO editorial_workspace_proposal_dismissals VALUES(?,'','now')", (pid,))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_proposal_dismissals VALUES('link','again','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE editorial_workspace_proposal_dismissals SET reason='x'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM editorial_workspace_proposal_dismissals")
        self.assertEqual(db.execute("SELECT count(*) FROM editorial_workspace_proposals").fetchone()[0], 3)

if __name__ == "__main__":
    unittest.main()
