import sqlite3
import unittest
from pathlib import Path
class PreparationSchemaTest(unittest.TestCase):
    def test_upgrade_keeps_legacy_deadlines_rounds_and_completion(self):
        db=sqlite3.connect(':memory:')
        for p in sorted(Path('migrations').glob('*.sql')):
            if p.name<'0006_media_preparation.sql': db.executescript(p.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        image=db.execute('SELECT id FROM images LIMIT 1').fetchone()[0]
        db.execute("INSERT INTO game_sessions(id,mode,created_at,expires_at,owner_hash) VALUES('s','timed',1,60001,'owner')")
        db.execute("INSERT INTO game_rounds VALUES('r','s',?,0,123)",(image,))
        db.execute("INSERT INTO game_sessions(id,mode,created_at,completed,owner_hash) VALUES('done','training',1,1,'owner')")
        db.executescript(Path('migrations/0006_media_preparation.sql').read_text())
        self.assertEqual(db.execute("SELECT expires_at,protocol_version,phase,started_at FROM game_sessions WHERE id='s'").fetchone(),(60001,1,'active',None))
        self.assertEqual(db.execute("SELECT image_id,presented_at FROM game_rounds WHERE id='r'").fetchone(),(image,123))
        self.assertEqual(db.execute("SELECT phase FROM game_sessions WHERE id='done'").fetchone()[0],'completed')
        db.execute("INSERT INTO answers VALUES('r','REAL',1,1000,877)")
        self.assertEqual(db.execute('SELECT count(*) FROM image_answer_statistics').fetchone()[0],1)
        db.execute("UPDATE game_sessions SET phase='invalidated' WHERE id='s'")
        self.assertEqual(db.execute('SELECT count(*) FROM image_answer_statistics').fetchone()[0],0)
        self.assertEqual(db.execute('SELECT count(*) FROM answers').fetchone()[0],1)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
