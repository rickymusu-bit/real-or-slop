import contextlib
import copy
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from pipeline.editorial import PipelineStop
from pipeline.v2.matrix_v4_0_0 import CATALOG,ROOT,CELLS,checksum,freeze,restore,run_branch,search_real,documentary_gate,export_review
from pipeline.v2.engine import Config
from pipeline.v2.fixtures import source,picture
from editorial_v2_direct_test import FixtureDirect


class MatrixPipelineTest(unittest.TestCase):
    def test_current_catalogue_freezes_free_aspect_and_artwork_without_museum_rule(self):
        catalog=json.loads(CATALOG.read_text())
        self.assertEqual(catalog['version'],'4.1.0')
        self.assertTrue(any(b['medium']=='artwork' for b in catalog['briefs']))
        self.assertTrue(all('frame when present' not in b['slop_prompt'] for b in catalog['briefs']))
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);freeze(folder,count=1)
            brief=json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs'][0]['brief']
            self.assertEqual(brief['parameters']['size'],'auto')
            self.assertEqual(brief['parameters']['presentation_mode'],'whole_frame')
            self.assertEqual(brief['instructions_version'],'4.1.0')
        proof=source('documented-artwork');proof.update(authenticity='verified',content_kind='artwork')
        self.assertEqual(documentary_gate(proof),proof)

    def test_freeze_is_cell_first_english_bounded_and_idempotent(self):
        with tempfile.TemporaryDirectory()as tmp:
            folder=Path(tmp);value=freeze(folder,count=5,cycle_id='test',stamp='2026-11-05T20:15:00Z')
            self.assertEqual(value['payload']['maximum_final_images'],10)
            self.assertEqual(freeze(folder,count=5,cycle_id='test'),value)
            briefs=json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs'];plan=json.loads((folder/'slop-plan.v4.0.0.json').read_text())
            self.assertEqual(len(briefs),5)
            for brief,idea in zip(briefs,plan['ideas']):
                b=brief['brief'];self.assertIn(b['intent_emotion']+':'+b['intent_topic'],CELLS);self.assertEqual(b['slop_prompt'],idea['prompt']);self.assertEqual(checksum(dict(brief=b,frozen_at=brief['frozen_at'])),brief['id'])
            with self.assertRaises(PipelineStop):freeze(folder,count=6,cycle_id='test')
            plan['ideas'][0]['prompt']='Changed after a REAL result';(folder/'slop-plan.v4.0.0.json').write_text(json.dumps(plan))
            with self.assertRaises(PipelineStop):restore(folder)
        with tempfile.TemporaryDirectory()as tmp:
            with self.assertRaises(PipelineStop):freeze(Path(tmp),count=26)

    def test_synthetic_branch_never_reads_real_results_and_resume_has_no_new_calls(self):
        ROOT.joinpath('.pipeline').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT/'.pipeline')as tmp,contextlib.redirect_stdout(io.StringIO()):
            folder=Path(tmp);freeze(folder,count=1,image_model='fixture-image',evaluator_model='fixture-vision')
            # Poisoned result titles/URLs/pixels cannot influence the generator.
            (folder/'real-acquisition.v4.0.0.json').write_text(json.dumps(dict(real_title='REAL SOURCE POISON',real_image='data:image/SECRET',inputs=['never read'])))
            api=FixtureDirect();cfg=Config(size='auto',presentation_mode='whole_frame',image_model='fixture-image',evaluator_model='fixture-vision',run_usd=10,daily_usd=10,evaluation_usd=.01,generation_usd=.1)
            result=run_branch(folder,'AI',api,cfg,execute=True,simulated=True,license_info=dict(author='Local fixture only',url='https://creativecommons.org/publicdomain/zero/1.0/'))
            self.assertEqual(result['candidates'],1);self.assertTrue(all('POISON'not in json.dumps(b) and 'SECRET'not in json.dumps(b)for _,b in api.calls))
            generation=next(b for e,b in api.calls if e=='images/generations');self.assertEqual(set(generation),{'model','prompt','n','size','quality'})
            count=len(api.calls);self.assertEqual(run_branch(folder,'AI',api,cfg,execute=True,simulated=True),result);self.assertEqual(len(api.calls),count)
            with self.assertRaises(PipelineStop):run_branch(folder,'AI',api,cfg,execute=True,simulated=False)
            self.assertFalse((folder/'REAL').exists())

    def test_real_documentary_failure_is_not_an_owner_refusal_and_does_not_download(self):
        class Provider:
            def search(self,client,query,limit):return [dict(provider='commons',source_id='one')]
        ROOT.joinpath('.pipeline').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT/'.pipeline')as tmp:
            folder=Path(tmp);freeze(folder,count=1);downloads=[]
            def download(*args):downloads.append(args);raise AssertionError('Must check documentary evidence first')
            state=search_real(folder,None,lambda hit:source('one'),download,{'commons':Provider()},execute=True,simulated=True)
            self.assertEqual(downloads,[]);self.assertEqual(state['inputs'],[]);self.assertGreater(len(state['attempts']),0);self.assertEqual(state['attempts'][0]['documentary_eligible'],0);self.assertEqual(state['attempts'][0]['reasons'],['documentary_unresolved'])
            self.assertNotIn('rejected',state)
            with self.assertRaises(PipelineStop):documentary_gate(source('unverified'))
            with self.assertRaises(PipelineStop):search_real(folder,None,None,None,execute=True)

    def test_real_branch_allows_off_target_results_and_never_fills_a_partner(self):
        ROOT.joinpath('.pipeline').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT/'.pipeline')as tmp,contextlib.redirect_stdout(io.StringIO()):
            folder=Path(tmp);value=freeze(folder,count=1,image_model='fixture-image',evaluator_model='fixture-vision');requests=json.loads((folder/'real-requests.v4.0.0.json').read_text())['requests']
            src=folder/'source.png';src.write_bytes(picture(3,(1024,1024)));proof=source('unrelated-but-valid-fixture');proof['authenticity']='verified'
            class Provider:
                def search(self,client,query,limit):return [dict(provider='commons',source_id='different_subject')]
            state=search_real(folder,None,lambda hit:proof,lambda *_:src,{'commons':Provider()},execute=True,simulated=True)
            self.assertEqual(len(state['inputs']),1);self.assertEqual(state['links'][0]['off_target'],None)
            cfg=Config(size='auto',presentation_mode='whole_frame',image_model='fixture-image',evaluator_model='fixture-vision',run_usd=10,daily_usd=10,evaluation_usd=.01,generation_usd=.1)
            api=FixtureDirect();result=run_branch(folder,'REAL',api,cfg,execute=True,simulated=True);self.assertEqual(result['candidates'],1);self.assertFalse((folder/'AI').exists());self.assertFalse(any(e=='images/generations'for e,_ in api.calls))
            output=export_review(folder);self.assertEqual(output['images'],1);self.assertEqual(output['candidates'][0]['brief_ref'],requests[0]['brief_ref']);self.assertFalse(output['published'])
            archived=json.loads((folder/'REAL/state.json').read_text())['candidates'][0]
            self.assertEqual(archived['matrix_brief_ref'],requests[0]['brief_ref'])
            self.assertEqual(output['candidates'][0]['candidate_id'],'v2-'+archived['id'])
            import importlib.util
            spec=importlib.util.spec_from_file_location('matrix_sync','scripts/sync-matrix.v4.0.0.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            staging=module.prepare(folder);self.assertTrue(staging['simulated'])
            self.assertTrue(all(path in ('briefs','attempts','candidates')for path,_ in staging['requests']))
            self.assertFalse(any(payload.get('decision')for _,payload in staging['requests']))
            self.assertEqual(module.main([str(folder)]),0)
            self.assertEqual(module.main([str(folder),'--apply']),1) # fixture cannot become a real proposal

            self.assertEqual(value,restore(folder))


class MatrixSchemaTest(unittest.TestCase):
    def db(self):
        db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
        for path in sorted(Path('migrations').glob('*.sql')):db.executescript(path.read_text())
        return db
    def candidate(self,db):
        cell=CELLS[0]
        db.execute("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at)VALUES('one','REAL',?,'key','{}','2026-11-05T20:15:00Z')",('a'*64,))
        db.execute("INSERT INTO editorial_matrix_briefs VALUES(?,'brief-one',1,?,'{}','2026-11-05T20:15:00Z')",('b'*64,cell))
        db.execute("INSERT INTO editorial_matrix_candidates VALUES('one',?,'REAL',?,?,'fixture','local','2026-11-05T20:15:00Z')",('a'*64,'b'*64,cell))
    def test_schema_retains_history_and_owner_feedback_is_captured_once(self):
        db=self.db();self.assertEqual(db.execute('SELECT count(*)FROM editorial_matrix_cells').fetchone()[0],144);self.candidate(db)
        db.execute("INSERT INTO editorial_review_inbox_events VALUES('owner-one','one',1,'owner','approved',?,'','2026-11-05T20:16:00Z')",('a'*64,))
        db.execute("UPDATE editorial_review_inbox SET status='approved',revision=1 WHERE id='one'")
        self.assertEqual(db.execute("SELECT decision FROM editorial_matrix_events WHERE kind='review'").fetchone()[0],'approved')
        db.execute("INSERT INTO editorial_review_inbox_events VALUES('owner-two','one',2,'owner','pending',?,'','2026-11-05T20:17:00Z')",('a'*64,))
        self.assertEqual(db.execute("SELECT count(*)FROM editorial_matrix_events").fetchone()[0],3)
        for table in ['editorial_matrix_briefs','editorial_matrix_events','editorial_matrix_candidates']:
            with self.assertRaises(sqlite3.IntegrityError):db.execute('DELETE FROM '+table)
        with self.assertRaises(sqlite3.IntegrityError):db.execute("DELETE FROM editorial_review_inbox WHERE id='one'")
        self.assertFalse(db.execute('PRAGMA foreign_key_check').fetchall())
    def test_caption_revisions_are_independent_and_bound_to_final_pixels(self):
        db=self.db();self.candidate(db)
        db.execute("INSERT INTO editorial_game_captions VALUES('one',1,?,'Una stanza con un tavolo.','{}','stamp')",('a'*64,))
        self.assertEqual(db.execute('SELECT status FROM editorial_caption_current').fetchone()[0],'draft')
        db.execute("INSERT INTO editorial_caption_reviews VALUES('caption-one','one',1,1,'approved','owner','','stamp')")
        db.execute("INSERT INTO editorial_game_captions VALUES('one',2,?,'Una stanza con sedie.','{}','stamp')",('a'*64,))
        self.assertEqual(db.execute('SELECT status FROM editorial_review_inbox').fetchone()[0],'pending')
        self.assertEqual(db.execute('SELECT status FROM editorial_caption_current ORDER BY revision').fetchall(),[('approved',),('draft',)])
        with self.assertRaises(sqlite3.IntegrityError):db.execute("INSERT INTO editorial_game_captions VALUES('one',3,?,'Diversa.','{}','stamp')",('c'*64,))
        with self.assertRaises(sqlite3.IntegrityError):db.execute("UPDATE editorial_game_captions SET game_caption='Changed'")
        with self.assertRaises(sqlite3.IntegrityError):db.execute("DELETE FROM editorial_caption_reviews")
