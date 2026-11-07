import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

class TopicSemanticMemoryTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for name in ["0019_editorial_workspace.v1.0.0.sql",
                     "0021_topic_discovery_opt_in.v1.0.0.sql",
                     "0022_topic_semantics.v1.0.0.sql"]:
            self.db.executescript((ROOT/"migrations"/name).read_text())
        self.db.execute("INSERT INTO editorial_workspace_topics VALUES(?,?,?,?)",
                        ("topic-1","European agricultural protests","european agricultural protests","now"))

    def tearDown(self):
        self.db.close()

    def test_owner_semantic_input_is_durable_even_with_discovery_off(self):
        self.db.execute(
            "INSERT INTO editorial_topic_semantics(topic_id,description,input_text,input_sha256,"
            "template_version,model,embedding_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ("topic-1","Protests across European countries",
             "Topic: European agricultural protests\nDescription: Protests across European countries",
             "a"*64,"1.0.0","text-embedding-3-small","pending","now","now"))
        row=self.db.execute(
            "SELECT description,embedding_status FROM editorial_topic_semantics WHERE topic_id='topic-1'"
        ).fetchone()
        self.assertEqual(row,("Protests across European countries","pending"))
        self.assertEqual(self.db.execute(
            "SELECT enabled FROM editorial_topic_discovery_settings WHERE singleton_id=1").fetchone()[0],0)

    def test_ready_requires_real_vector_and_other_states_cannot_fake_one(self):
        self.db.execute(
            "INSERT INTO editorial_topic_semantics(topic_id,description,input_text,input_sha256,"
            "template_version,model,embedding_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ("topic-1","","Topic: European agricultural protests",
             "b"*64,"1.0.0","text-embedding-3-small","pending","now","now"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE editorial_topic_semantics SET embedding_status='ready' WHERE topic_id='topic-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE editorial_topic_semantics SET vector_json='[]' WHERE topic_id='topic-1'")
        self.db.execute("UPDATE editorial_topic_semantics SET embedding_status='ready',"
                        "vector_json='[0.2,0.3]',dimensions=2 WHERE topic_id='topic-1'")
        self.assertEqual(self.db.execute(
            "SELECT embedding_status FROM editorial_topic_semantics WHERE topic_id='topic-1'"
        ).fetchone()[0],"ready")

if __name__=="__main__":
    unittest.main()
