"""Schema 0031: tag vocabulary, current photo tags and append-only history. v1.0.0, 2026-11-09T05:00:00Z."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

class PhotoTagSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "migrations" / "0031_photo_tags.v1.0.0.sql").read_text())
        self.db.execute("INSERT INTO editorial_tags VALUES('t1','burning-car','owner','now',NULL)")

    def tearDown(self):
        self.db.close()

    def test_labels_are_lowercase_unique_and_never_the_placeholder(self):
        db = self.db
        for label in ("Burning-car", "burning car", "untagged", "x" * 41, ""):
            with self.assertRaises(sqlite3.IntegrityError, msg=label):
                db.execute("INSERT INTO editorial_tags VALUES('t2',?,'owner','now',NULL)", (label,))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_tags VALUES('t2','burning-car','owner','now',NULL)")
        db.execute("UPDATE editorial_tags SET retired_at='later' WHERE id='t1'")
        db.execute("INSERT INTO editorial_tags VALUES('t2','burning-car','owner','now',NULL)")  # label reusable after retirement

    def test_identity_retirement_and_history_are_protected(self):
        db = self.db
        for statement in ("UPDATE editorial_tags SET label='car' WHERE id='t1'", "DELETE FROM editorial_tags"):
            with self.assertRaises(sqlite3.IntegrityError, msg=statement):
                db.execute(statement)
        db.execute("UPDATE editorial_tags SET retired_at='later' WHERE id='t1'")
        for statement in ("UPDATE editorial_tags SET retired_at=NULL WHERE id='t1'", "UPDATE editorial_tags SET retired_at='again' WHERE id='t1'",
                          "INSERT INTO editorial_image_tags VALUES('photo','t1','owner','now')"):
            with self.assertRaises(sqlite3.IntegrityError, msg=statement):
                db.execute(statement)
        db.execute("INSERT INTO editorial_image_tag_events VALUES('e1','photo','t1','add','a','owner','now')")
        for statement in ("UPDATE editorial_image_tag_events SET action='remove'", "DELETE FROM editorial_image_tag_events"):
            with self.assertRaises(sqlite3.IntegrityError, msg=statement):
                db.execute(statement)
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_image_tag_events VALUES('e2','photo','t1','rename','a','owner','now')")

if __name__ == "__main__":
    unittest.main()
