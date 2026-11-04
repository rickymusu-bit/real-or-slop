import json
from pathlib import Path
import sqlite3
import unittest


class EditorialV2SchemaTest(unittest.TestCase):
    def db(self):
        db = sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):
            db.executescript(path.read_text())
        return db

    def run_row(self, db):
        db.execute("INSERT INTO editorial_v2_runs(id,origin,status,stage,config_json,input_json,created_at,updated_at) VALUES('v2-run','AI','active','planned','{}','{}','date','date')")

    def test_additive_upgrade_preserves_every_legacy_row_and_publication(self):
        db = sqlite3.connect(':memory:')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name < '0013':
                db.executescript(path.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        db.executescript(Path('scripts/seed-publication.sql').read_text())
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before = {table: db.execute('SELECT * FROM ' + table).fetchall() for table in tables}
        db.executescript(Path('migrations/0013_editorial_v2_experiments.sql').read_text())
        self.assertEqual(before, {table: db.execute('SELECT * FROM ' + table).fetchall() for table in tables})
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_original_dossier_and_human_reviews_are_append_only(self):
        db = self.db(); self.run_row(db)
        db.execute("INSERT INTO editorial_v2_candidates(id,run_id,origin,original_sha256,preview_sha256,dossier_json,created_at) VALUES('candidate','v2-run','AI','original','preview','{}','date')")
        for sql in ["UPDATE editorial_v2_candidates SET dossier_json='{}'", "UPDATE editorial_v2_candidates SET origin='REAL'", "DELETE FROM editorial_v2_candidates", "UPDATE editorial_v2_runs SET input_json='{}'"]:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(sql)
        db.execute("INSERT INTO editorial_v2_reviews VALUES('review','candidate',1,'human','approved','{}','date')")
        for sql in ["UPDATE editorial_v2_reviews SET decision='rejected'", "DELETE FROM editorial_v2_reviews"]:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(sql)
        db.execute("UPDATE editorial_v2_candidates SET review_state='approved'")
        self.assertEqual(db.execute('SELECT count(*) FROM published_images').fetchone()[0], 0)
        self.assertEqual(db.execute('SELECT count(*) FROM images').fetchone()[0], 0)

    def test_cost_ledger_is_atomic_and_separate_run_ids_do_not_collide(self):
        db = self.db(); self.run_row(db)
        calls = json.dumps([dict(id='v2-call', kind='generation', cost=.1)])
        db.execute('INSERT INTO editorial_v2_reservations VALUES(?,?,?,?,?,?)', ('reservation', 'v2-run', 'day', calls, .1, 'date'))
        self.assertEqual(db.execute('SELECT run_id,reserved_usd FROM editorial_usage').fetchone(), ('v2-v2-run', .1))
        conflicting = json.dumps([dict(id='new-call', kind='evaluation', cost=.01), dict(id='v2-call', kind='evaluation', cost=.01)])
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute('INSERT INTO editorial_v2_reservations VALUES(?,?,?,?,?,?)', ('conflict', 'v2-run', 'day', conflicting, .02, 'date'))
        self.assertIsNone(db.execute("SELECT id FROM editorial_usage WHERE id='new-call'").fetchone())
        self.assertIsNone(db.execute("SELECT id FROM editorial_v2_reservations WHERE id='conflict'").fetchone())
