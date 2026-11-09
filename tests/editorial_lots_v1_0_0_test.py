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


class LotRemovalSchemaTest(unittest.TestCase):
    """Schema 0030: unacquired links are deletable only after a removal snapshot. v1.0.0, 2026-11-08T21:00:00Z."""
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for filename in MIGRATIONS + ("0030_editorial_lot_removal.v1.0.0.sql",):
            self.db.executescript((ROOT / "migrations" / filename).read_text())
        db = self.db
        db.execute("INSERT INTO editorial_workspace_topics VALUES('t1','Paris protests','paris protests','now')")
        db.execute("INSERT INTO editorial_workspace_proposals VALUES('link','t1','link','https://commons.wikimedia.org/wiki/File:A.jpg',NULL,'','now')")
        db.execute("INSERT INTO editorial_workspace_proposal_dismissals VALUES('link','thumbnail','now')")
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES('i1','REAL',?,'k','{}','now')", ("a" * 64,))
        db.execute("INSERT INTO editorial_workspace_proposals VALUES('upload','t1','upload',NULL,'i1','','now')")
        db.execute("INSERT INTO editorial_workspace_proposals VALUES('acquired','t1','link','https://commons.wikimedia.org/wiki/File:B.jpg',NULL,'','now')")
        db.execute("INSERT INTO editorial_workspace_acquisitions VALUES('acquired','i1','{}','now')")

    def tearDown(self):
        self.db.close()

    def test_links_need_a_removal_snapshot_and_photos_stay_protected(self):
        db = self.db
        for statement in ("DELETE FROM editorial_workspace_proposal_dismissals WHERE proposal_id='link'",
                          "DELETE FROM editorial_workspace_proposals WHERE id='link'"):
            with self.assertRaises(sqlite3.IntegrityError, msg=statement):
                db.execute(statement)
        db.execute("INSERT INTO editorial_lot_removals VALUES('t1','Paris protests','paris protests','{}','now')")
        db.execute("DELETE FROM editorial_workspace_proposal_dismissals WHERE proposal_id='link'")
        db.execute("DELETE FROM editorial_workspace_proposals WHERE id='link'")
        for pid in ("upload", "acquired"):
            with self.assertRaises(sqlite3.IntegrityError, msg=pid):
                db.execute("DELETE FROM editorial_workspace_proposals WHERE id=?", (pid,))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE editorial_lot_removals SET title='x'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM editorial_lot_removals")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_lot_removals VALUES('t2','x','x','not json','now')")
        self.assertEqual(db.execute("SELECT count(*) FROM editorial_workspace_proposals").fetchone()[0], 2)


class ProposalVisibilitySchemaTest(unittest.TestCase):
    """Schema 0032: append-only dismiss/restore events. v1.0.0, 2026-11-09T07:50:00Z."""
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for filename in MIGRATIONS + ("0030_editorial_lot_removal.v1.0.0.sql", "0032_proposal_visibility.v1.0.0.sql"):
            self.db.executescript((ROOT / "migrations" / filename).read_text())
        db = self.db
        db.execute("INSERT INTO editorial_workspace_topics VALUES('t1','Paris riots','paris riots','now')")
        db.execute("INSERT INTO editorial_workspace_proposals VALUES('link','t1','link','https://commons.wikimedia.org/wiki/File:A.jpg',NULL,'','now')")
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES('i1','REAL',?,'k','{}','now')", ("a" * 64,))
        db.execute("INSERT INTO editorial_workspace_proposals VALUES('upload','t1','upload',NULL,'i1','','now')")

    def tearDown(self):
        self.db.close()

    def test_events_are_ordered_append_only_and_limited_to_unacquired_links(self):
        db = self.db
        db.execute("INSERT INTO editorial_workspace_proposal_visibility VALUES('e1','link','dismiss','',1,'now')")
        db.execute("INSERT INTO editorial_workspace_proposal_visibility VALUES('e2','link','restore','',2,'now')")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_proposal_visibility VALUES('e3','link','dismiss','',2,'now')")  # same seq
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_proposal_visibility VALUES('e4','upload','dismiss','',1,'now')")
        db.execute("INSERT INTO editorial_workspace_proposal_visibility VALUES('e5','upload','restore','',1,'now')")  # harmless
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_proposal_visibility VALUES('e6','link','hide','',3,'now')")
        for statement in ("UPDATE editorial_workspace_proposal_visibility SET action='dismiss'", "DELETE FROM editorial_workspace_proposal_visibility WHERE proposal_id='link'"):
            with self.assertRaises(sqlite3.IntegrityError, msg=statement):
                db.execute(statement)
        db.execute("INSERT INTO editorial_lot_removals VALUES('t1','Paris','paris','{}','now')")
        db.execute("DELETE FROM editorial_workspace_proposal_visibility WHERE proposal_id='link'")  # only with the lot's removal snapshot
