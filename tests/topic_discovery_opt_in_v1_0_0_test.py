"""Topic Discovery is a separate owner feature, initially disabled. v1.0.0."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

class TopicDiscoveryOptInSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.executescript((ROOT/"migrations/0021_topic_discovery_opt_in.v1.0.0.sql").read_text())

    def tearDown(self):
        self.db.close()

    def test_default_off_with_iso_timestamp(self):
        row=self.db.execute("SELECT singleton_id,enabled,updated_at FROM editorial_topic_discovery_settings").fetchone()
        self.assertEqual(row[0:2], (1,0))
        self.assertIn("T",row[2])
        self.assertTrue(row[2].endswith("Z"))

    def test_owner_toggle_persists_and_rejects_unknown_state(self):
        self.db.execute("UPDATE editorial_topic_discovery_settings SET enabled=1 WHERE singleton_id=1")
        self.assertEqual(self.db.execute("SELECT enabled FROM editorial_topic_discovery_settings").fetchone()[0],1)
        self.db.execute("UPDATE editorial_topic_discovery_settings SET enabled=0 WHERE singleton_id=1")
        self.assertEqual(self.db.execute("SELECT enabled FROM editorial_topic_discovery_settings").fetchone()[0],0)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE editorial_topic_discovery_settings SET enabled=2 WHERE singleton_id=1")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO editorial_topic_discovery_settings VALUES(2,1,'2026-11-07T00:00:00Z')")
if __name__=="__main__":
    unittest.main()
