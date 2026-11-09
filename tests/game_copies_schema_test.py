"""v1.0.0, 2026-11-09T11:00:00Z: migration 0032, uniform WebP game copies (docs/copie-di-gioco.v1.0.0.md)."""
from pathlib import Path
import sqlite3
import unittest


class GameCopiesSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:'); self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name < '0032': self.db.executescript(path.read_text())
        self.db.executescript(Path('scripts/seed.sql').read_text())
        tables = [r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before = {t: self.db.execute('SELECT * FROM '+t).fetchall() for t in tables}
        self.db.executescript(Path('migrations/0032_game_copies.v1.0.0.sql').read_text())
        self.assertEqual(before, {t: self.db.execute('SELECT * FROM '+t).fetchall() for t in tables})  # additive only
        self.db.execute("INSERT INTO images(id,type,title,description,author,authenticity_evidence,r2_key,sha256,explanation,status,demo) "
                        "VALUES('img','REAL','T','','A','E','file','" + 'a'*64 + "','X','approved',0)")
    def copy(self, source='a'*64, image='img', key='game-copies/img/x.webp', **overrides):
        row = dict(image_id=image, source_sha256=source, r2_key=key, sha256='b'*64, mime='image/webp', width=2048, height=1365,
                   bytes=900000, recipe='webp-q0.85-max2048-srgb-v1', created_at='2026-11-09T11:00:00Z') | overrides
        self.db.execute('INSERT INTO editorial_game_copies(' + ','.join(row) + ') VALUES(' + ','.join('?'*len(row)) + ')', tuple(row.values()))
    def test_copy_derives_from_admitted_file_and_is_immutable(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'derive'): self.copy(source='c'*64)
        with self.assertRaises(sqlite3.IntegrityError): self.copy(image='missing')
        with self.assertRaises(sqlite3.IntegrityError): self.copy(mime='image/jpeg')
        with self.assertRaises(sqlite3.IntegrityError): self.copy(width=4000)
        with self.assertRaises(sqlite3.IntegrityError): self.copy(bytes=4000001)
        self.copy()
        with self.assertRaises(sqlite3.IntegrityError): self.copy(key='game-copies/img/y.webp')  # one per image
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'immutable'): self.db.execute("UPDATE editorial_game_copies SET width=10")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'immutable'): self.db.execute("DELETE FROM editorial_game_copies")

if __name__ == '__main__': unittest.main()
