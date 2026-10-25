import sqlite3
import unittest
from pathlib import Path
class SchemaTest(unittest.TestCase):
    def test_migrations_and_idempotent_seed(self):
        db=sqlite3.connect(':memory:')
        for file in sorted(Path('migrations').glob('*.sql')): db.executescript(file.read_text())
        for _ in range(2): db.executescript(Path('scripts/seed.sql').read_text())
        self.assertEqual(db.execute('SELECT count(*) FROM images').fetchone()[0],24)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        with self.assertRaises(sqlite3.IntegrityError): db.execute("UPDATE images SET type='WRONG'")
    def test_statistics_include_solo_and_pvp(self):
        db=sqlite3.connect(':memory:')
        for file in sorted(Path('migrations').glob('*.sql')):db.executescript(file.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        image=db.execute('SELECT id FROM images LIMIT 1').fetchone()[0]
        db.execute("INSERT INTO game_sessions(id,mode,created_at,owner_hash) VALUES('s','training',1,'fixture')")
        db.execute("INSERT INTO game_rounds(id,session_id,image_id,position) VALUES('r','s',?,0)",(image,))
        db.execute("INSERT INTO answers VALUES('r','REAL',1,2,1)")
        db.execute("INSERT INTO players(id) VALUES('p')")
        db.execute("INSERT INTO challenges VALUES('c',1,NULL,'{}')")
        db.execute("INSERT INTO challenge_answers VALUES('c','p',0,?,'AI',0,1)",(image,))
        self.assertEqual(db.execute('SELECT COUNT(*),AVG(correct) FROM image_answer_statistics').fetchone(),(2,0.5))
        with self.assertRaises(sqlite3.IntegrityError):db.execute('UPDATE images SET sha256=(SELECT sha256 FROM images LIMIT 1)')
