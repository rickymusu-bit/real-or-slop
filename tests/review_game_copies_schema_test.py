"""v1.0.0, 2026-11-09T12:00:00Z: migration 0032, game copies reviewed by the owner (docs/copie-di-gioco.v2.0.0.md)."""
from pathlib import Path
import sqlite3
import unittest

COLUMNS = ['id', 'origin', 'sha256', 'media_key', 'metadata_json', 'pair_key', 'status', 'revision', 'created_at', 'source_sha256']

class ReviewGameCopiesSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:'); self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')
        for path in sorted(Path('migrations').glob('*.sql')):
            if path.name < '0032': self.db.executescript(path.read_text())
        self.db.executescript(Path('scripts/seed.sql').read_text())
        tables = [r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        self.before = {t: self.db.execute('SELECT * FROM '+t).fetchall() for t in tables}
        self.db.executescript(Path('migrations/0032_review_game_copies.v1.0.0.sql').read_text())
        self.tables = tables
        self.db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES('q','REAL',?,'orig','{\"title\":\"T\"}','d')", ('a'*64,))
    def copy(self, **overrides):
        row = dict(inbox_id='q', source_sha256='a'*64, sha256='b'*64, media_key='game-copies/q/b.webp', mime='image/webp', width=2048,
                   height=1365, bytes=900000, recipe='webp-q0.85-max2048-srgb-v1', created_at='d') | overrides
        self.db.execute('INSERT INTO editorial_review_game_copies(' + ','.join(row) + ') VALUES(' + ','.join('?'*len(row)) + ')', tuple(row.values()))
    def effective(self):
        cursor = self.db.execute("SELECT * FROM editorial_review_effective_images WHERE id='q'")
        return dict(zip([c[0] for c in cursor.description], cursor.fetchone()))
    def test_additive_and_view_columns_unchanged(self):
        self.assertEqual({t: self.db.execute('SELECT * FROM '+t).fetchall() for t in self.tables if t != 'editorial_review_inbox'},
                         {t: v for t, v in self.before.items() if t != 'editorial_review_inbox'})
        self.assertEqual(list(self.effective()), COLUMNS)
    def test_copy_becomes_the_effective_file_and_original_hash_stays(self):
        self.assertEqual(self.effective()['sha256'], 'a'*64)
        self.copy()
        row = self.effective()
        self.assertEqual((row['sha256'], row['media_key'], row['source_sha256']), ('b'*64, 'game-copies/q/b.webp', 'a'*64))
        self.assertIn('"game_copy"', row['metadata_json']); self.assertIn('"title":"T"', row['metadata_json'])
    def test_copy_rules(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'current'): self.copy(source_sha256='c'*64)
        with self.assertRaises(sqlite3.IntegrityError): self.copy(mime='image/jpeg')
        with self.assertRaises(sqlite3.IntegrityError): self.copy(width=4096)
        with self.assertRaises(sqlite3.IntegrityError): self.copy(bytes=4000001)
        self.db.execute("UPDATE editorial_review_inbox SET status='rejected',revision=1 WHERE id='q'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'rejected'): self.copy()
        self.db.execute("UPDATE editorial_review_inbox SET status='pending',revision=2 WHERE id='q'")
        self.copy()
        with self.assertRaises(sqlite3.IntegrityError): self.copy(media_key='other')  # one per inbox file
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'immutable'): self.db.execute("UPDATE editorial_review_game_copies SET width=1")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'immutable'): self.db.execute("DELETE FROM editorial_review_game_copies")

if __name__ == '__main__': unittest.main()
