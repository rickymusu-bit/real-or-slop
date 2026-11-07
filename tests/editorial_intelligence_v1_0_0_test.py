import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

class IntelligenceSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for filename in (
            "0014_unified_review_inbox.sql",
            "0015_rejected_review_deletion.sql",
            "0019_editorial_workspace.v1.0.0.sql",
            "0020_editorial_intelligence.v1.0.0.sql",
        ):
            self.db.executescript((ROOT/"migrations"/filename).read_text())
        self.db.execute("INSERT INTO editorial_workspace_topics VALUES(?,?,?,?)",
                        ("t", "Proteste a Parigi nell'ottobre 2026", "proteste a parigi nell'ottobre 2026", "now"))

    def tearDown(self):
        self.db.close()

    def test_immutable_topic_seed_and_per_slot_prompt(self):
        db=self.db
        db.execute("INSERT INTO editorial_topic_slop_seed VALUES(?,?,?,?)",
                   ("t",'{"topic":"Proteste a Parigi nell\\u0027ottobre 2026","taxonomy_version":"1.0.0","slop_feedback":[]}',"f"*64,"now"))
        db.execute("INSERT INTO editorial_slop_prompt_bank VALUES(?,?,?,?,?,?,?,?)",
                   ("p", "t", 0, "An original documentary-style invented photo scene.", "landscape","gpt-6.1-terra","a"*64,"now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_slop_prompt_bank VALUES(?,?,?,?,?,?,?,?)",
                       ("q","t",0,"Another original 35 chars photo prompt.","portrait","gpt-6.1-terra","b"*64,"now"))
        self.assertEqual(db.execute("SELECT count(*) FROM editorial_slop_prompt_bank").fetchone()[0],1)

    def test_acquisition_must_reference_proposal_and_review_inbox(self):
        db=self.db
        db.execute("INSERT INTO editorial_workspace_proposals VALUES(?,?,?,?,?,?,?)",
                   ("p","t","link","https://commons.wikimedia.org/wiki/File:Test.jpg",None,"","now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_acquisitions VALUES(?,?,?,?)",
                       ("p","missing",'{}',"now"))
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,?,?,?,?,?)",
                   ("c","REAL","a"*64,"owner-photo",'{}',"now"))
        db.execute("INSERT INTO editorial_workspace_acquisitions VALUES(?,?,?,?)",
                   ("p","c",'{"source":"commons"}',"now"))
        self.assertEqual(db.execute("SELECT count(*) FROM editorial_workspace_acquisitions").fetchone()[0],1)

    def test_suggestion_and_job_status_are_auditable(self):
        db=self.db
        db.execute("INSERT INTO editorial_topic_suggestions VALUES(?,?,?,?,?,?,?)",
                   ("s","Bruxelles, protesta agricoltori gennaio 2024","bruxelles, protesta agricoltori gennaio 2024",
                    "New time and location","suggested","now","now"))
        db.execute("UPDATE editorial_topic_suggestions SET status='accepted' WHERE id='s'")
        db.execute("INSERT INTO editorial_workspace_jobs VALUES(?,?,?,?,?,?,?,?,?)",
                   ("j","suggest","t","suggest:req","prepared",'{}',None,"now","now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO editorial_workspace_jobs VALUES(?,?,?,?,?,?,?,?,?)",
                       ("j2","suggest","t","suggest:req","prepared",'{}',None,"now","now"))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE editorial_workspace_jobs SET status='published' WHERE id='j'")

if __name__=="__main__":
    unittest.main()
