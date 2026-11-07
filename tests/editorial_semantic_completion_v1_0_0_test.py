import sqlite3
import unittest
from pathlib import Path

class SemanticCompletionTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        for name in sorted(Path('migrations').glob('*.sql')):
            self.db.executescript(name.read_text())

    def tearDown(self):
        self.db.close()

    def test_revision_archives_original_text_vector_and_receipt(self):
        db=self.db
        db.execute("INSERT INTO editorial_workspace_topics VALUES('topic','Original topic','original topic','now')")
        db.execute("INSERT INTO editorial_topic_semantics VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   ('topic','Original description','Original input','a'*64,'1','small','ready',2,'[1,0]',12,None,'now','now'))
        db.execute("UPDATE editorial_topic_semantics SET description='New description',input_text='New input',"
                   "input_sha256=?,embedding_status='pending',vector_json=NULL,dimensions=NULL,input_tokens=NULL WHERE topic_id='topic'",('b'*64,))
        self.assertEqual(db.execute('SELECT description,vector_json,input_tokens FROM editorial_topic_semantic_history').fetchone(),
                         ('Original description','[1,0]',12))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute('DELETE FROM editorial_topic_semantic_history')
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE editorial_topic_semantic_history SET description='changed'")
        self.assertEqual(db.execute('SELECT embedding_status,vector_json FROM editorial_topic_semantics').fetchone(),('pending',None))

    def test_screening_diagnostics_do_not_approve_or_publish(self):
        db=self.db
        db.execute("INSERT INTO editorial_topic_suggestions VALUES('s','New topic','new topic','rationale','suggested','now','now')")
        db.execute("INSERT INTO editorial_topic_suggestion_screening(suggestion_id,operation_id,slot,status) VALUES('s','op',0,'duplicate')")
        self.assertEqual(db.execute('SELECT status FROM editorial_topic_suggestions').fetchone()[0],'suggested')
        self.assertEqual(db.execute('SELECT count(*) FROM published_images').fetchone()[0],0)
        self.assertEqual(db.execute('SELECT enabled FROM editorial_topic_discovery_settings').fetchone()[0],0)
