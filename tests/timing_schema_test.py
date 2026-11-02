import sqlite3
import unittest
from pathlib import Path

class TimingSchemaTest(unittest.TestCase):
    def test_upgrade_keeps_original_deadlines_answers_and_challenges(self):
        db=sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name < '0009': db.executescript(path.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        image=db.execute('SELECT id FROM images LIMIT 1').fetchone()[0]
        db.execute("INSERT INTO game_sessions(id,mode,created_at,expires_at,owner_hash) VALUES('old','timed',1,60001,'owner')")
        db.execute("INSERT INTO game_rounds(id,session_id,image_id,position,presented_at) VALUES('r','old',?,0,5)",(image,))
        db.execute("INSERT INTO answers VALUES('r','REAL',1,10,5)")
        db.execute("INSERT INTO players(id,nickname) VALUES('p','Historic player')")
        db.execute("INSERT INTO challenges(id,created_at,completed_at,settings) VALUES('c',1,10,'{}')")
        db.execute("INSERT INTO challenge_players VALUES('c','p',100,5)")
        db.execute("INSERT INTO challenge_answers VALUES('c','p',0,?,'REAL',1,5)",(image,))
        before={t:db.execute('SELECT * FROM '+t).fetchall() for t in ('answers','players','challenges','challenge_players','challenge_answers')}
        db.executescript(Path('migrations/0009_per_image_timing.sql').read_text())
        self.assertEqual(before,{t:db.execute('SELECT * FROM '+t).fetchall() for t in before})
        self.assertEqual(db.execute("SELECT expires_at,timing_mode,round_seconds FROM game_sessions WHERE id='old'").fetchone(),(60001,'legacy',None))
        self.assertEqual(db.execute("SELECT presented_at,expires_at,timed_out FROM game_rounds WHERE id='r'").fetchone(),(5,None,0))
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_timeout_is_not_a_fabricated_valid_answer(self):
        db=sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')): db.executescript(path.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        image=db.execute('SELECT id FROM images LIMIT 1').fetchone()[0]
        db.execute("INSERT INTO game_sessions(id,mode,created_at,owner_hash,timing_mode,round_seconds) VALUES('s','timed',1,'owner','per-image',20)")
        db.execute("INSERT INTO game_rounds(id,session_id,image_id,position,presented_at,expires_at,timed_out) VALUES('r','s',?,0,1000,21000,1)",(image,))
        self.assertEqual(db.execute('SELECT count(*) FROM answers').fetchone()[0],0)
        self.assertEqual(db.execute('SELECT count(*) FROM image_answer_statistics').fetchone()[0],0)
