import json
import sqlite3
import unittest
from pathlib import Path

class SlopSchemaTest(unittest.TestCase):
    def test_studio_upgrade_is_additive_and_history_is_immutable(self):
        db = sqlite3.connect(':memory:')
        migration = Path('migrations/0005_slop_studio.sql')
        for file in sorted(Path('migrations').glob('*.sql')):
            if file.name < migration.name: db.executescript(file.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        tables = ['images', 'sources', 'licenses', 'image_categories', 'image_curation', 'review_events']
        before = {table: db.execute('SELECT * FROM '+table).fetchall() for table in tables}
        db.executescript(migration.read_text())
        self.assertEqual(before, {table: db.execute('SELECT * FROM '+table).fetchall() for table in tables})
        self.assertEqual(db.execute('SELECT count(*) FROM slop_plans').fetchone()[0], 0)
        insert = "INSERT INTO slop_plans VALUES('p',1,?,'1.0.0','prompt',NULL,'reviewer','date','date')"
        for data in [{}, [], {'schema_version': 2}, {'schema_version': True}]:
            with self.assertRaises(sqlite3.IntegrityError): db.execute(insert, (json.dumps(data),))
        db.execute(insert, (json.dumps({'schema_version': 1, 'profile': 'esperto'}),))
        db.execute("INSERT INTO slop_plan_events VALUES('e','p',1,'created','r','reason','null','{}','date')")
        for statement in ["DELETE FROM slop_plan_events", "UPDATE slop_plan_events SET reason='altered'", "UPDATE slop_plans SET image_id='missing'"]:
            with self.assertRaises(sqlite3.IntegrityError): db.execute(statement)
        with self.assertRaises(sqlite3.IntegrityError): db.execute("UPDATE images SET difficulty='esperto'")
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
