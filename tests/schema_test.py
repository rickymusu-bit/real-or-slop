import sqlite3
import unittest
from pathlib import Path
class SchemaTest(unittest.TestCase):
    def test_additive_curation_upgrade_preserves_legacy_catalog_and_audits(self):
        db=sqlite3.connect(':memory:')
        migration=Path('migrations/0004_image_curation.sql')
        for file in sorted(Path('migrations').glob('*.sql')):
            if file.name < migration.name: db.executescript(file.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        tables=['images','sources','licenses','categories','image_categories','review_events']
        before={t:db.execute('SELECT * FROM '+t).fetchall() for t in tables}
        db.executescript(migration.read_text())
        self.assertEqual(before,{t:db.execute('SELECT * FROM '+t).fetchall() for t in tables})
        self.assertEqual(db.execute('SELECT count(*) FROM image_curation').fetchone()[0],0)
        image=db.execute('SELECT id FROM images LIMIT 1').fetchone()[0]
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO image_curation(image_id,revision,reviewer,updated_at) VALUES('missing',1,'r','date')")
        db.execute("INSERT INTO image_curation(image_id,revision,reviewer,updated_at) VALUES(?,1,'r','date')",(image,))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE image_curation SET verified_date='1930'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE images SET difficulty='esperto' WHERE id=?",(image,))
        db.execute("INSERT INTO image_curation_events VALUES('e',?,1,'r','motivo','null','{}','date')",(image,))
        for sql in ["UPDATE image_curation_events SET reason='altered'", "DELETE FROM image_curation_events"]:
            with self.assertRaises(sqlite3.IntegrityError): db.execute(sql)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
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
        db.execute("INSERT INTO challenges(id,created_at,completed_at,settings) VALUES('c',1,NULL,'{}')")
        db.execute("INSERT INTO challenge_answers VALUES('c','p',0,?,'AI',0,1)",(image,))
        self.assertEqual(db.execute('SELECT COUNT(*),AVG(correct) FROM image_answer_statistics').fetchone(),(2,0.5))
        with self.assertRaises(sqlite3.IntegrityError):db.execute('UPDATE images SET sha256=(SELECT sha256 FROM images LIMIT 1)')
