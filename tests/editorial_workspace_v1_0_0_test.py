import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

class WorkspaceSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for filename in ("0014_unified_review_inbox.sql", "0015_rejected_review_deletion.sql",
                         "0019_editorial_workspace.v1.0.0.sql"):
            self.db.executescript((ROOT / "migrations" / filename).read_text())

    def tearDown(self):
        self.db.close()

    def test_link_and_upload_are_audited_separately(self):
        db = self.db
        db.execute("INSERT INTO editorial_workspace_topics VALUES(?,?,?,?)",
                   ("t1", "Proteste a Bruxelles, ottobre 2026", "proteste a bruxelles, ottobre 2026", "2026-11-07T13:00:00Z"))
        db.execute("INSERT INTO editorial_workspace_proposals VALUES(?,?,?,?,?,?,?)",
                   ("p1", "t1", "link", "https://commons.wikimedia.org/wiki/File:Example", None, "", "now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_proposals VALUES(?,?,?,?,?,?,?)",
                       ("p2", "t1", "link", "https://commons.wikimedia.org/wiki/File:Example", None, "", "now"))
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,?,?,?,?,?)",
                   ("owner-1", "REAL", "a"*64, "owner-proposals/owner-1",
                    '{"source_kind":"owner-upload","provenance_status":"unverified"}', "now"))
        db.execute("INSERT INTO editorial_workspace_proposals VALUES(?,?,?,?,?,?,?)",
                   ("p3", "t1", "upload", None, "owner-1", "home photo", "now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE editorial_workspace_proposals SET note='modified' WHERE id='p3'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_proposals VALUES(?,?,?,?,?,?,?)",
                       ("p4", "t1", "upload", None, None, "", "now"))
        self.assertEqual(db.execute("SELECT count(*) FROM editorial_workspace_proposals").fetchone()[0], 2)

    def test_topic_key_is_unique_and_previous_review_audit_remains(self):
        db = self.db
        db.execute("INSERT INTO editorial_workspace_topics VALUES(?,?,?,?)",
                   ("t1","Proteste a Bruxelles","proteste a bruxelles","now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_topics VALUES(?,?,?,?)",
                       ("t2","PROTESTE A BRUXELLES","proteste a bruxelles","now"))
        self.assertTrue(db.execute("SELECT name FROM sqlite_master WHERE name='editorial_review_inbox_events'").fetchone())

if __name__ == "__main__":
    unittest.main()
