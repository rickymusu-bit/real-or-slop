import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest


def database(path=':memory:'):
    db=sqlite3.connect(path)
    for p in sorted(Path('migrations').glob('*.sql')):db.executescript(p.read_text())
    db.executescript(Path('scripts/seed.sql').read_text())
    db.executescript(Path('scripts/seed-publication.sql').read_text())
    return db


def photo(db,name='source',role='SLOP',phash=None):
    db.execute('INSERT INTO reference_photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        (name,'fixture',name,'https://example.invalid/'+name,hashlib.sha256((name+'original').encode()).hexdigest(),hashlib.sha256((name+'file').encode()).hexdigest(),phash or hashlib.sha256(name.encode()).hexdigest()[:16],role,'batch-'+name,1,'{}','{}','2026-11-01T00:00:00Z'))


def image(db,name,kind='REAL',demo=0):
    db.execute("INSERT INTO sources VALUES(?, 'fixture',?,?,'evidence')",(name,name,'https://example.invalid/'+name))
    db.execute("INSERT INTO images(id,type,title,description,author,source_id,authenticity_evidence,r2_key,ai_model,ai_prompt,status,sha256,explanation,demo) VALUES(?,?,'t','d','a',?,'e',?,'m','p','in-review',?,'reveal',?)",(name,kind,name,name,hashlib.sha256(name.encode()).hexdigest(),demo))


def approve(db,name):
    db.execute("INSERT INTO review_events VALUES(?,?,'human','approved','','2026-11-01T00:00:00Z')",('review-'+name,name))
    db.execute("UPDATE images SET status='approved' WHERE id=?",(name,))


def publish(db,uid,names):
    db.execute("INSERT INTO publication_batches VALUES(?,?,'human','2026-11-01T00:00:00Z')",(uid,json.dumps(names)))


class EditorialSchemaTest(unittest.TestCase):
    def test_upgrade_preserves_sessions_answers_history_and_archives_real_difficulty(self):
        db=sqlite3.connect(':memory:')
        for p in sorted(Path('migrations').glob('*.sql')):
            if p.name<'0007':db.executescript(p.read_text())
        db.executescript(Path('tests/legacy-seed.sql').read_text())
        uid=db.execute('SELECT id FROM images LIMIT 1').fetchone()[0]
        db.execute("INSERT INTO game_sessions(id,mode,created_at,owner_hash) VALUES('s','training',1,'owner')")
        db.execute("INSERT INTO game_rounds VALUES('r','s',?,0,3)",(uid,))
        db.execute("INSERT INTO answers VALUES('r','REAL',1,5,2)")
        db.execute("INSERT INTO review_events VALUES('e',?,'human','approved','','date')",(uid,))
        before={t:db.execute('SELECT * FROM '+t).fetchall() for t in ('game_sessions','game_rounds','answers','review_events')}
        columns={t:','.join(r[1] for r in db.execute('PRAGMA table_info('+t+')')) for t in before}
        old=dict(db.execute('SELECT id,difficulty FROM images'))
        for p in sorted(Path('migrations').glob('*.sql')):
            if p.name>='0007':db.executescript(p.read_text())
        self.assertEqual(before,{t:db.execute('SELECT '+columns[t]+' FROM '+t).fetchall() for t in before})
        self.assertEqual(old,dict(db.execute('SELECT image_id,assigned_value FROM legacy_image_difficulty')))
        self.assertNotIn('difficulty',[r[1] for r in db.execute('PRAGMA table_info(images)')])
        self.assertEqual(db.execute('SELECT count(*) FROM published_images').fetchone()[0],24)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_unbalanced_legacy_catalog_refuses_migration_without_withdrawing_assets(self):
        db=sqlite3.connect(':memory:')
        for p in sorted(Path('migrations').glob('*.sql')):
            if p.name<'0008':db.executescript(p.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        db.execute("UPDATE images SET status='rejected' WHERE id=(SELECT id FROM images WHERE type='AI' LIMIT 1)")
        db.commit()
        before=db.execute('SELECT id,status FROM images ORDER BY id').fetchall()
        with self.assertRaises(sqlite3.IntegrityError):
            db.executescript('BEGIN;'+Path('migrations/0008_editorial_publication.sql').read_text()+'COMMIT;')
        db.rollback()
        self.assertEqual(before,db.execute('SELECT id,status FROM images ORDER BY id').fetchall())
        self.assertFalse(db.execute("SELECT name FROM sqlite_master WHERE name='published_images'").fetchall())

    def test_source_registry_prevents_real_in_both_orders_by_identity_hash_and_near_hash(self):
        for direction in ('source-first','real-first'):
            with self.subTest(direction=direction):
                db=database()
                if direction=='source-first':
                    photo(db)
                    with self.assertRaises(sqlite3.IntegrityError):image(db,'source')
                    image(db,'other')
                    sha=db.execute('SELECT file_sha256 FROM reference_photos').fetchone()[0]
                    with self.assertRaises(sqlite3.IntegrityError):db.execute("UPDATE images SET sha256=? WHERE id='other'",(sha,))
                    phash=db.execute('SELECT perceptual_hash FROM reference_photos').fetchone()[0]
                    near=f'{int(phash,16)^31:016x}'
                    with self.assertRaises(sqlite3.IntegrityError):db.execute("UPDATE images SET perceptual_hash=? WHERE id='other'",(near,))
                else:
                    image(db,'source')
                    with self.assertRaises(sqlite3.IntegrityError):photo(db)

    def test_reference_identity_and_near_dedup_immutable_provenance(self):
        db=database();photo(db,phash='a5a5a5a5a5a5a5a5')
        for statement in ["UPDATE reference_photos SET role='REAL'",'DELETE FROM reference_photos']:
            with self.assertRaises(sqlite3.IntegrityError):db.execute(statement)
        with self.assertRaises(sqlite3.IntegrityError):photo(db)
        with self.assertRaises(sqlite3.IntegrityError):photo(db,'near',phash='a5a5a5a5a5a5a5ba')

    def test_manual_approvals_can_wait_publication_requires_balanced_human_reviewed_groups(self):
        db=database()
        for name,kind in [('r','REAL'),('a','AI'),('extra','AI')]:image(db,name,kind)
        approve(db,'r');approve(db,'a');approve(db,'extra')
        self.assertEqual(db.execute("SELECT count(*) FROM images WHERE demo=0 AND status='approved'").fetchone()[0],3)
        self.assertEqual(db.execute('SELECT count(*) FROM published_images').fetchone()[0],24)
        for names in [['r'],['a','extra'],['r','r'],['missing']]:
            with self.assertRaises(sqlite3.IntegrityError):publish(db,'bad',names)
        publish(db,'balanced',['r','a'])
        self.assertEqual(db.execute('SELECT count(*) FROM published_images').fetchone()[0],26)
        self.assertFalse(db.execute("SELECT 1 FROM published_images WHERE image_id='extra'").fetchall())
        for statement in ["UPDATE images SET type='AI' WHERE id='r'","UPDATE images SET status='rejected' WHERE id='r'","DELETE FROM published_images WHERE image_id='r'"]:
            with self.assertRaises(sqlite3.IntegrityError):db.execute(statement)
        image(db,'unchecked','REAL');db.execute("UPDATE images SET status='approved' WHERE id='unchecked'")
        with self.assertRaises(sqlite3.IntegrityError):publish(db,'unchecked',['unchecked','extra'])

    def test_atomic_publication_rolls_back_entire_batch_on_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=str(Path(tmp)/'db.sqlite');db=database(path)
            for name,kind in [('r','REAL'),('a','AI')]:image(db,name,kind);approve(db,name)
            db.commit()
            # Two independent connections select the same approved candidates.
            # SQLite serializes the write; stale membership is rejected by SQL.
            other=sqlite3.connect(path);other.execute('PRAGMA foreign_keys=ON')
            publish(db,'first',['r','a']);db.commit()
            with self.assertRaises(sqlite3.IntegrityError):publish(other,'second',['r','a'])
            other.rollback()
            self.assertEqual(db.execute("SELECT count(*) FROM publication_batches WHERE id='second'").fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM published_images').fetchone()[0],26)

    def test_private_queue_limit_is_persistent_and_enforced_by_sql(self):
        db=database();db.execute('UPDATE editorial_controls SET queue_limit=1')
        image(db,'one')
        with self.assertRaises(sqlite3.IntegrityError):image(db,'two','AI')

    def test_catalog_query_requires_publication_and_preserves_demo(self):
        db=database();image(db,'private');approve(db,'private')
        rows=db.execute("SELECT i.id FROM images i JOIN published_images p ON p.image_id=i.id WHERE i.status='approved' AND i.demo=1").fetchall()
        self.assertEqual(len(rows),24)
        self.assertNotIn(('private',),rows)

    def test_actual_worker_budget_sql_preserves_run_daily_and_call_caps(self):
        source=Path('worker/editorial.ts').read_text()
        statement='INSERT INTO editorial_usage'+source.split('INSERT INTO editorial_usage',1)[1].split('`).bind',1)[0]
        db=database()
        def reserve(uid,run='run',kind='evaluation',run_cap=10,daily_cap=2,eval_cap=2,gen_cap=1,regen_cap=1,total_cap=100):
            cost=1;day='2026-11-01'
            return db.execute(statement,(uid,run,day,kind,cost,day+'T00:00:00Z',cost,total_cap,run,cost,run_cap,day,cost,daily_cap,run,kind,eval_cap,run,kind,gen_cap,run,kind,regen_cap)).rowcount
        self.assertEqual(reserve('one'),1)
        self.assertEqual(reserve('two'),1)
        self.assertEqual(reserve('three'),0)
        self.assertEqual(reserve('new-run','other'),0)  # daily budget survives a new process/run
        self.assertEqual(reserve('one'),0)  # a reservation cannot fund another call
        self.assertEqual(db.execute('SELECT sum(reserved_usd) FROM editorial_usage').fetchone()[0],2)
        self.assertEqual(reserve('run-cap','limited',run_cap=.5,daily_cap=100),0)
        self.assertEqual(reserve('gen','genrun','generation',daily_cap=100),1)
        self.assertEqual(reserve('regen','genrun','regeneration',daily_cap=100),0)
        self.assertEqual(reserve('total','another-run',daily_cap=100,total_cap=3),0)
        self.assertEqual(db.execute('SELECT sum(reserved_usd) FROM editorial_usage').fetchone()[0],3)

    def test_published_diagnostics_use_final_slop_scores_and_report_missing_data(self):
        db=database();photo(db,'score-source','REAL')
        image(db,'score-real');image(db,'score-ai','AI')
        approve(db,'score-real');approve(db,'score-ai')
        db.execute("INSERT INTO editorial_image_reviews VALUES('score-real','score-source',?,'2026-11-01T00:00:00Z')",(json.dumps(dict(score=70,scores=dict(surprise=80,readability=90))),))
        photo(db,'slop-source','SLOP')
        db.execute("INSERT INTO editorial_attempts VALUES('attempt','slop-source','score-ai',?,'2026-11-01T00:00:00Z')",(json.dumps(dict(evaluation=dict(score=75,scores=dict(surprise=65,readability=85)))),))
        publish(db,'score-publication',['score-real','score-ai'])
        source=Path('worker/publication.ts').read_text()
        statement='WITH evaluated AS ('+source.split('WITH evaluated AS (',1)[1].split('`).all()',1)[0]
        db.row_factory=sqlite3.Row
        rows=[dict(row) for row in db.execute(statement)]
        real=next(row for row in rows if row['demo']==0 and row['type']=='REAL')
        slop=next(row for row in rows if row['demo']==0 and row['type']=='AI')
        self.assertEqual(real['surprise'],80);self.assertEqual(slop['surprise'],65)
        self.assertEqual(slop['editorial_score'],75)
        demo=next(row for row in rows if row['demo']==1)
        self.assertEqual(demo['evaluated_count'],0);self.assertIsNone(demo['editorial_score'])

    def test_unbalanced_legacy_inventory_stops_before_retiring_the_old_column(self):
        db=sqlite3.connect(':memory:')
        for p in sorted(Path('migrations').glob('*.sql')):
            if p.name<'0007':db.executescript(p.read_text())
        db.executescript(Path('tests/legacy-seed.sql').read_text())
        db.execute("UPDATE images SET status='rejected' WHERE id=(SELECT id FROM images WHERE type='AI' LIMIT 1)")
        db.commit()
        before=db.execute('SELECT * FROM images ORDER BY id').fetchall()
        with self.assertRaises(sqlite3.IntegrityError):
            db.executescript('BEGIN;'+Path('migrations/0007_retire_assigned_difficulty.sql').read_text()+'COMMIT;')
        db.rollback()
        self.assertIn('difficulty',[row[1] for row in db.execute('PRAGMA table_info(images)')])
        self.assertEqual(before,db.execute('SELECT * FROM images ORDER BY id').fetchall())
