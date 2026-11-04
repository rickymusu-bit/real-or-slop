import json
from pathlib import Path
import re
import sqlite3
import unittest

class BulkRejectedDeletionTest(unittest.TestCase):
    def db(self):
        db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
        for p in sorted(Path('migrations').glob('*.sql')):db.executescript(p.read_text())
        for n,state in [(1,'rejected'),(2,'rejected'),(3,'approved'),(4,'pending')]:
            db.execute('INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,status,revision,created_at) VALUES(?,?,?,?,?,?,?,?)',(str(n),'REAL',str(n)*64,'key','{}',state,1,'date'))
        return db
    def selection(self,db):
        return json.dumps([dict(id=r[0],sha256=r[1],revision=r[2]) for r in db.execute("SELECT id,sha256,revision FROM editorial_review_effective_images WHERE status='rejected' ORDER BY id")])
    def execute(self,db,selection,actor='owner:unique-operation'):
        source=Path('worker/review-bulk-delete.ts').read_text()
        insert=re.search(r'export const insertRejectedDeletions = `(.*?)`;',source,re.S).group(1)
        delete=re.search(r'export const deleteRejectedImages = `(.*?)`;',source,re.S).group(1)
        with db:
            added=db.execute(insert,(actor,'date',selection,selection,selection)).rowcount
            removed=db.execute(delete,(selection,actor,'date')).rowcount
        return added,removed
    def test_confirmed_collection_is_deleted_across_pages_while_other_states_survive(self):
        db=self.db()
        db.execute("UPDATE editorial_review_inbox SET status='approved' WHERE id='1'")
        metadata=dict(profile={},profile_image_sha256='f'*64,normalization=dict(owner_requested=True,approved_source_sha256='1'*64,crop_decision=dict(preserves_context=True,needs_review=False)))
        db.execute('INSERT INTO editorial_review_presentations VALUES(?,?,?,?,?,?,?,?,?)',('1','1'*64,1,'f'*64,'normalized/key',1024,1024,json.dumps(metadata),'date'))
        db.execute("UPDATE editorial_review_inbox SET status='rejected',revision=2 WHERE id='1'")
        for n in range(5,76):
            db.execute('INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,status,created_at) VALUES(?,?,?,?,?,?,?)',(str(n),'AI',f'{n:064x}','key','{}','rejected','date'))
        selected=self.selection(db);count=len(json.loads(selected));self.assertGreater(count,50)
        self.assertEqual(self.execute(db,selected),(count,count))
        self.assertEqual(db.execute('SELECT id,status FROM editorial_review_inbox ORDER BY id').fetchall(),[('3','approved'),('4','pending')])
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_deleted_images').fetchone()[0],count)
        self.assertEqual(db.execute("SELECT sha256 FROM editorial_review_deleted_images WHERE image_id='1'").fetchone()[0],'1'*64)
    def test_concurrent_approval_or_revision_aborts_whole_selection(self):
        for update in ("UPDATE editorial_review_inbox SET status='approved',revision=2 WHERE id='1'", "UPDATE editorial_review_inbox SET revision=2 WHERE id='1'"):
            with self.subTest(update=update):
                db=self.db();selection=self.selection(db);db.execute(update)
                self.assertEqual(self.execute(db,selection),(0,0))
                self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_inbox').fetchone()[0],4)
                self.assertEqual(db.execute('SELECT count(*) FROM editorial_review_deleted_images').fetchone()[0],0)
    def test_new_rejections_outside_confirmed_snapshot_are_not_deleted(self):
        db=self.db();selected=self.selection(db);db.execute("UPDATE editorial_review_inbox SET status='rejected',revision=2 WHERE id='4'")
        self.assertEqual(self.execute(db,selected),(2,2))
        self.assertEqual(db.execute("SELECT status FROM editorial_review_inbox WHERE id='4'").fetchone()[0],'rejected')
    def test_a_previous_deletion_marker_cannot_authorize_an_unrelated_request(self):
        db=self.db();selected=self.selection(db)
        db.execute("INSERT INTO editorial_review_deleted_images SELECT id,origin,sha256,revision,'previous-request','date' FROM editorial_review_inbox WHERE id='1'")
        source=Path('worker/review-bulk-delete.ts').read_text();delete=re.search(r'export const deleteRejectedImages = `(.*?)`;',source,re.S).group(1)
        self.assertEqual(db.execute(delete,(selected,'different-request','date')).rowcount,0)
