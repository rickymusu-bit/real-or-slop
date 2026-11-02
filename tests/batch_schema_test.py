from pathlib import Path
import hashlib
import json
import sqlite3
import unittest

class BatchSchemaTest(unittest.TestCase):
    def db(self):
        db=sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):db.executescript(path.read_text())
        return db
    def add_run(self,db,uid='run'):
        db.execute("INSERT INTO editorial_batch_runs(id,day,status,stage,capacity,config_json,created_at,updated_at) VALUES(?,?,'active','ranking',2,'{}','date','date')",(uid,uid))
    def claim(self,db,name='source',run='run',phash='a5a5a5a5a5a5a5a5'):
        db.execute('INSERT INTO editorial_batch_sources VALUES(?,?,?,?,?,?,?,?)',(name,run,'fixture',name,'https://example.invalid/'+name,hashlib.sha256((name+'original').encode()).hexdigest(),hashlib.sha256(name.encode()).hexdigest(),phash))
    def test_upgrade_keeps_all_preexisting_data(self):
        db=sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name<'0011':db.executescript(path.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        before={row[0]:db.execute('SELECT * FROM '+row[0]).fetchall() for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()}
        db.executescript(Path('migrations/0011_editorial_batches.sql').read_text())
        self.assertEqual(before,{table:db.execute('SELECT * FROM '+table).fetchall() for table in before})
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
    def test_claims_are_immutable_near_deduplicated_and_owned(self):
        db=self.db();self.add_run(db);self.claim(db)
        for sql in ["DELETE FROM editorial_batch_sources","UPDATE editorial_batch_sources SET source_id='changed'","UPDATE editorial_batch_runs SET config_json='{}'"]:
            with self.assertRaises(sqlite3.IntegrityError):db.execute(sql)
        self.add_run(db,'other')
        with self.assertRaises(sqlite3.IntegrityError):self.claim(db,'near','other','a5a5a5a5a5a5a5a4')
        photo=('source','fixture','source','https://example.invalid/source',hashlib.sha256(b'sourceoriginal').hexdigest(),hashlib.sha256(b'source').hexdigest(),'a5a5a5a5a5a5a5a5','REAL','other',1,'{}','{}','date')
        with self.assertRaises(sqlite3.IntegrityError):db.execute('INSERT INTO reference_photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',photo)
        own=(*photo[:8],'run',*photo[9:]);db.execute('INSERT INTO reference_photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',own)
    def test_reservation_and_usage_insert_are_one_atomic_operation(self):
        db=self.db();self.add_run(db)
        requests=json.dumps([{'id':'one','kind':'evaluation','cost':.01},{'id':'two','kind':'generation','cost':.1}])
        db.execute('INSERT INTO editorial_batch_reservations VALUES(?,?,?,?,?,?)',('reservation','run','day',requests,.11,'date'))
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_usage').fetchone()[0],2)
        duplicate=json.dumps([{'id':'new','kind':'evaluation','cost':.01},{'id':'one','kind':'evaluation','cost':.01}])
        with self.assertRaises(sqlite3.IntegrityError):db.execute('INSERT INTO editorial_batch_reservations VALUES(?,?,?,?,?,?)',('conflict','run','day',duplicate,.02,'date'))
        self.assertIsNone(db.execute("SELECT id FROM editorial_usage WHERE id='new'").fetchone())
        self.assertIsNone(db.execute("SELECT id FROM editorial_batch_reservations WHERE id='conflict'").fetchone())
