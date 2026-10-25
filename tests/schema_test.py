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
