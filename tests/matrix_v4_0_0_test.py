import contextlib
import copy
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from pipeline.editorial import PipelineStop
from pipeline.v2.matrix_v4_0_0 import CATALOG,ROOT,CELLS,checksum,freeze,restore,run_branch,search_real,documentary_gate,export_review
from pipeline.v2.engine import Config
from pipeline.v2.fixtures import source,picture
from pipeline.v2.composition import composition_plan, POLICY_SHA256
from pipeline.v2.photography import photography_plan, photography_directive, POLICY_SHA256 as PHOTO_SHA256
from editorial_v2_direct_test import FixtureDirect


class MatrixPipelineTest(unittest.TestCase):
    def test_capture_targets_are_diverse_frozen_and_validated_by_worker_contract(self):
        plan=photography_plan(6,53)
        self.assertEqual(plan,photography_plan(6,53))
        self.assertNotEqual(plan,photography_plan(6,54))
        self.assertEqual(len({p['id'] for p in plan}),6)
        self.assertEqual(photography_plan(12,53)[:6],plan)
        self.assertEqual(len({p['id'] for p in photography_plan(12,53)[6:]}),6)
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);frozen=freeze(folder,count=25,seed=53)
            rows=json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs']
            ideas=json.loads((folder/'slop-plan.v4.0.0.json').read_text())['ideas']
            audit=json.loads((folder/'photography-plan.v1.0.0.json').read_text())
            photo_rows=[r['brief'] for r in rows if r['brief']['medium']=='photograph']
            self.assertGreaterEqual(len(photo_rows),6)
            self.assertEqual(len(audit['records']),len(photo_rows))
            self.assertEqual(audit['kind'],'intended_not_observed')
            for b,profile in zip(photo_rows,photography_plan(len(photo_rows),53)):
                self.assertEqual(b['photography']['profile'],profile)
                self.assertEqual(b['photography']['policy_sha256'],PHOTO_SHA256)
                self.assertTrue(b['slop_prompt'].endswith(photography_directive(profile)))
                self.assertIn('1/'+str(profile['shutter_denominator'])+' s',b['slop_prompt'])
                self.assertLessEqual(len(b['slop_prompt']),6000)
            for row,idea in zip(rows,ideas):self.assertEqual(row['brief']['slop_prompt'],idea['prompt'])
            requests=json.loads((folder/'real-requests.v4.0.0.json').read_text())
            self.assertNotIn('Photographic capture',json.dumps(requests))
            self.assertEqual(freeze(folder,count=25,seed=53),frozen)
            code='import {validateBrief} from "./shared/editorial-brief.v4.0.0.ts";import {readFileSync} from "node:fs";for(const r of JSON.parse(readFileSync(0,"utf8")))validateBrief(r.brief);'
            result=subprocess.run(['node','--import','tsx','--input-type=module','-e',code],input=json.dumps(rows),capture_output=True,text=True,cwd=ROOT)
            self.assertEqual(result.returncode,0,result.stderr)
            audit['records'][0]['profile']['iso_max']=999999
            (folder/'photography-plan.v1.0.0.json').write_text(json.dumps(audit))
            with self.assertRaises(PipelineStop):restore(folder)

    def test_artwork_is_not_turned_into_a_photograph(self):
        catalog=json.loads(CATALOG.read_text());art=next(b for b in catalog['briefs'] if b['medium']=='artwork')
        catalog['briefs']=[art]
        selection=dict(selection=[dict(cell=art['intent_emotion']+':'+art['intent_topic'],weight=1)],config={})
        with tempfile.TemporaryDirectory() as tmp,patch('pipeline.v2.matrix_v4_0_0.select',return_value=selection):
            folder=Path(tmp);freeze(folder,catalog=catalog,count=1)
            b=json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs'][0]['brief']
            self.assertNotIn('photography',b)
            self.assertNotIn('Photographic capture',b['slop_prompt'])
            self.assertEqual(json.loads((folder/'photography-plan.v1.0.0.json').read_text())['records'],[])

    def test_v42_cycle_keeps_its_existing_composition_without_capture_targets(self):
        catalog=json.loads((ROOT/'data/editorial/briefs.v4.2.0.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);first=freeze(folder,catalog=catalog,count=2)
            self.assertEqual(freeze(folder,catalog=catalog,count=2),first)
            self.assertNotIn('photography_policy_sha256',first['payload']['identity'])
            self.assertFalse((folder/'photography-plan.v1.0.0.json').exists())
            for r in json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs']:
                self.assertIn('composition',r['brief'])
                self.assertNotIn('photography',r['brief'])
                self.assertNotIn('Photographic capture',r['brief']['slop_prompt'])

    def test_composition_varies_viewpoint_and_roll_without_real_inputs(self):
        plan=composition_plan(6,53)
        self.assertEqual(plan,composition_plan(6,53))
        self.assertNotEqual(plan,composition_plan(6,54))
        self.assertEqual(len({p['id']for p in plan}),6)
        self.assertEqual(sum(p['roll_degrees']==0 for p in plan),4)
        self.assertEqual({p['roll_degrees']for p in plan},{-6,0,6})
        self.assertGreaterEqual(len({p['viewpoint']for p in plan}),4)
        with tempfile.TemporaryDirectory()as tmp:
            folder=Path(tmp);freeze(folder,count=6,seed=53)
            briefs=json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs']
            ideas=json.loads((folder/'slop-plan.v4.0.0.json').read_text())['ideas']
            for row,idea,profile in zip(briefs,ideas,plan):
                b=row['brief'];self.assertEqual(b['composition']['profile_id'],profile['id'])
                self.assertEqual(b['composition']['policy_sha256'],POLICY_SHA256)
                self.assertIn(profile['directive'],b['slop_prompt'])
                self.assertEqual(idea['prompt'],b['slop_prompt'])
                self.assertNotIn('Camera composition',b['description'])
            path=folder/'composition-plan.v1.0.0.json';audit=json.loads(path.read_text())
            self.assertEqual(audit['kind'],'intended_not_observed')
            audit['records'][0]['roll_degrees']=90;path.write_text(json.dumps(audit))
            with self.assertRaises(PipelineStop):restore(folder)

    def test_previous_catalogue_keeps_original_prompts_without_new_composition(self):
        old=json.loads((ROOT/'data/editorial/briefs.v4.1.0.json').read_text())
        with tempfile.TemporaryDirectory()as tmp:
            folder=Path(tmp);frozen=freeze(folder,catalog=old,count=2)
            self.assertEqual(freeze(folder,catalog=old,count=2),frozen)
            self.assertFalse((folder/'composition-plan.v1.0.0.json').exists())
            for r in json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs']:
                self.assertNotIn('composition',r['brief'])
                source=next(b for b in old['briefs']if b['id']==r['brief']['brief_id'])
                self.assertEqual(source['slop_prompt'],r['brief']['slop_prompt'])

    def test_current_catalogue_freezes_free_aspect_and_artwork_without_museum_rule(self):
        catalog=json.loads(CATALOG.read_text())
        self.assertEqual(catalog['version'],'4.3.0')
        self.assertTrue(any(b['medium']=='artwork' for b in catalog['briefs']))
        self.assertTrue(all('frame when present' not in b['slop_prompt'] for b in catalog['briefs']))
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);freeze(folder,count=1)
            brief=json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs'][0]['brief']
            self.assertEqual(brief['parameters']['size'],'auto')
            self.assertEqual(brief['parameters']['presentation_mode'],'whole_frame')
            self.assertEqual(brief['instructions_version'],'4.3.0')
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
            frozen_prompt=json.loads((folder/'slop-plan.v4.0.0.json').read_text())['ideas'][0]['prompt']
            self.assertEqual(generation['prompt'],frozen_prompt)
            self.assertIn('Photographic capture brief:',generation['prompt'])
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
