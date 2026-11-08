from pathlib import Path
import json
import sqlite3
import unittest


class EditorialBudgetSchemaTest(unittest.TestCase):
    def db(self):
        db=sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        for path in sorted(Path('migrations').glob('*.sql')):
            db.executescript(path.read_text())
        return db

    def reserve(self,db,uid,cost):
        db.execute("INSERT INTO editorial_usage VALUES(?,?,'2026-11-08','evaluation',?,'date')",(uid,'run',cost))

    def reset(self,db,operation,previous=None):
        db.execute('''INSERT INTO editorial_budget_periods(operation_id,previous_id,baseline_usd,allowance_usd,created_at)
            SELECT ?,?,COALESCE((SELECT sum(reserved_usd) FROM editorial_usage),0),5,'date' ''',(operation,previous))
        return db.execute('SELECT id FROM editorial_budget_current').fetchone()[0]

    def test_upgrade_preserves_preexisting_rows_and_has_no_default_reset(self):
        db=sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name<'0027':db.executescript(path.read_text())
        self.reserve(db,'old',4.5)
        tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before={t:db.execute('SELECT * FROM '+t).fetchall() for t in tables}
        db.executescript(Path('migrations/0027_editorial_budget_periods.v1.0.0.sql').read_text())
        self.assertEqual(before,{t:db.execute('SELECT * FROM '+t).fetchall() for t in tables})
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_budget_periods').fetchone()[0],0)
        self.assertEqual(db.execute('SELECT sum(reserved_usd) FROM editorial_budget_usage').fetchone()[0],4.5)

    def test_resets_preserve_ledger_and_enforce_one_shared_allowance(self):
        db=self.db();self.reserve(db,'old',4.5);first=self.reset(db,'first')
        self.reserve(db,'new-text',3);self.reserve(db,'new-image',2)
        with self.assertRaisesRegex(sqlite3.IntegrityError,'budget exhausted'):
            self.reserve(db,'new-embedding',.000001)
        self.assertEqual(db.execute('SELECT sum(reserved_usd) FROM editorial_budget_usage').fetchone()[0],5)
        before=db.execute('SELECT * FROM editorial_usage ORDER BY id').fetchall()
        self.reset(db,'second',first)
        self.assertEqual(before,db.execute('SELECT * FROM editorial_usage ORDER BY id').fetchall())
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_budget_usage').fetchone()[0],0)
        self.reserve(db,'after-reset',.000001)
        self.assertEqual(db.execute('SELECT sum(reserved_usd) FROM editorial_usage').fetchone()[0],9.500001)
        for sql in ['DELETE FROM editorial_budget_periods','UPDATE editorial_budget_periods SET allowance_usd=50',
                    'DELETE FROM editorial_budget_allocations','UPDATE editorial_budget_allocations SET period_id=2']:
            with self.assertRaisesRegex(sqlite3.IntegrityError,'immutable'):db.execute(sql)

    def test_legacy_batch_transaction_rolls_back_when_shared_allowance_is_exceeded(self):
        db=self.db();self.reset(db,'first');self.reserve(db,'fill',4.99)
        db.execute("INSERT INTO editorial_batch_runs(id,day,status,stage,capacity,config_json,created_at,updated_at) VALUES('batch','day','active','ranking',2,'{}','date','date')")
        db.commit()
        with self.assertRaisesRegex(sqlite3.IntegrityError,'budget exhausted'):
            db.execute('INSERT INTO editorial_batch_reservations VALUES(?,?,?,?,?,?)',
                       ('too-large','batch','day',json.dumps([{'id':'one','kind':'evaluation','cost':.01},{'id':'two','kind':'evaluation','cost':.01}]),.02,'date'))
        self.assertEqual(db.execute('SELECT id FROM editorial_usage ORDER BY id').fetchall(),[('fill',)])
        self.assertEqual(db.execute('SELECT usage_id FROM editorial_budget_allocations').fetchall(),[('fill',)])
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_batch_reservations').fetchone()[0],0)

    def test_membership_survives_dump_restore_and_duplicate_reservation_replay(self):
        db=self.db();self.reserve(db,'z-old',4.5);self.reset(db,'first');self.reserve(db,'a-new',5)
        db.execute("INSERT OR IGNORE INTO editorial_usage VALUES('a-new','run','day','evaluation',5,'date')")
        dump='\n'.join(db.iterdump());restored=sqlite3.connect(':memory:');restored.executescript(dump)
        self.assertEqual(restored.execute('SELECT id FROM editorial_budget_usage').fetchall(),[('a-new',)])
        self.assertEqual(restored.execute('SELECT sum(reserved_usd) FROM editorial_usage').fetchone()[0],9.5)
        self.assertEqual(restored.execute('PRAGMA foreign_key_check').fetchall(),[])
