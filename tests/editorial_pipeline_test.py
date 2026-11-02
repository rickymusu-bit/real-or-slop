import base64
from dataclasses import replace
from datetime import date
import hashlib
import io
import json
import os
from pathlib import Path
import random
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from PIL import Image
from pipeline.editorial import (AXES, BRIEF, RUBRIC, Budget, Config, FixtureOpenAI, OpenAI,
                                PipelineStop, candidates, evaluation, execute, generate_slop, main, rank_photos)


def config(**kwargs):
    return replace(Config(analysis_model='fixture-analysis',image_model='fixture-generator',evaluator_model='fixture-evaluator',
                          run_usd=100,daily_usd=100,evaluation_usd=.01,generation_usd=.1), **kwargs)


class Oracle(FixtureOpenAI):
    def __init__(self, source_scores=None, final_score=80):
        super().__init__()
        self.source_scores = iter(source_scores or [])
        self.final_score = final_score
        self.observed = []
        self.prompts = []

    def vision(self, model, instructions, image, context=''):
        self.observed.append((model,instructions,image,context))
        if instructions == BRIEF:
            return super().vision(model,instructions,image,context)
        score = next(self.source_scores, self.final_score) if model == 'fixture-analysis' else self.final_score
        return dict(scores={key: score for key in AXES},reason='Dettaglio concreto della scena '+str(score),concrete_motive='Relazione insolita fra gli oggetti',photographic=True)

    def generate(self, model, prompt, parameters):
        self.prompts.append((model,prompt,parameters))
        return super().generate(model,prompt,parameters)


def batch(folder, count):
    rng = random.Random(312)
    rows=[]
    for n in range(count):
        path = folder / (str(n)+'.png')
        Image.frombytes('RGB',(24,20),rng.randbytes(24*20*3)).save(path)
        rows.append(dict(file=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),metadata=dict(type='REAL',title='Fixture '+str(n),
            author='Fixture',provider='fixture',source_id=str(n),source_url='https://example.invalid/'+str(n),evidence='Documented fixture only',
            explanation='Review required',categories=['arte'],license_url='https://creativecommons.org/publicdomain/zero/1.0/')))
    return rows


class EditorialPipelineTest(unittest.TestCase):
    def test_single_ranking_twenty_and_partial_batches(self):
        for n in (1,3,7,19,20):
            with self.subTest(n=n), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);cfg=config();api=Oracle(range(n));rows=candidates(batch(root,n),root)
                ranked=rank_photos(rows,api,cfg,Budget(cfg))
                self.assertEqual([p['evaluation']['score'] for p in ranked],list(reversed(range(n))))
                self.assertEqual([p['role'] for p in ranked],['REAL']*((n+1)//2)+['SLOP']*(n//2))
                self.assertEqual([p['rank'] for p in ranked],list(range(1,n+1)))
                if n==20:
                    self.assertEqual(len([p for p in ranked if p['role']=='REAL']),10)
                    self.assertEqual(len([p for p in ranked if p['role']=='SLOP']),10)

    def test_stable_identity_and_source_url_exact_and_near_dedup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);rows=batch(root,3)
            selected=candidates(rows,root)
            self.assertEqual(candidates(rows,root), selected)
            self.assertEqual(len(candidates(rows+[rows[0]],root)),3)
            self.assertEqual(candidates(rows,root,selected),[])
            copy={**selected[0], 'id':'changed', 'metadata':{**selected[0]['metadata'],'source_id':'changed','source_url':'https://example.invalid/changed'},'original_sha256':'different','file_sha256':'different','sha256':'different'}
            self.assertEqual(candidates(rows,root,[copy])[0]['id'],selected[1]['id'])

    def test_bottom_half_stays_slop_even_if_top_real_below_threshold(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);cfg=config(threshold=65)
            counts=execute(batch(root,4),root,root/'out',cfg,Oracle([10,20,30,40]),Budget(cfg))
            self.assertEqual(counts,dict(ranked=4,real=0,slop=2))
            ranked=json.loads((root/'out/ranking.json').read_text())
            self.assertEqual([p['role'] for p in ranked],['REAL','REAL','SLOP','SLOP'])

    def test_text_only_generation_blind_final_evaluation_and_preserved_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);cfg=config();photo=candidates(batch(root,1),root)[0];api=Oracle()
            record=generate_slop(photo,api,cfg,Budget(cfg),root)
            self.assertEqual(record['reference_id'],photo['id'])
            self.assertEqual(record['prompt'],api.prompts[0][1])
            self.assertIn('liberamente',record['prompt'])
            self.assertNotIn(photo['metadata']['source_url'],record['prompt'])
            self.assertEqual(record['model'],'fixture-generator')
            self.assertEqual(record['sha256'],hashlib.sha256(Path(record['derived_file']).read_bytes()).hexdigest())
            blind=api.observed[-1]
            self.assertEqual(blind[0],'fixture-evaluator');self.assertEqual(blind[1],RUBRIC);self.assertEqual(blind[3],'')
            self.assertNotEqual(blind[2],Path(photo['file']).read_bytes())
            self.assertEqual(json.loads((root/'attempts'/ (record['id']+'.json')).read_text()),record)
            self.assertTrue(record['timestamp'].endswith('Z'))
            self.assertIn('direct_observations',record['description']);self.assertIn('inferences',record['description'])

    def test_insufficient_slop_discarded_rebriefed_with_bounded_attempts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);cfg=config(attempts=2);api=Oracle(final_score=10);saved=[]
            record=generate_slop(candidates(batch(root,1),root)[0],api,cfg,Budget(cfg),root,saved.append)
            self.assertIsNone(record);self.assertEqual(len(saved),2)
            self.assertTrue(all(x['status']=='discarded' for x in saved))
            briefs=[call for call in api.observed if call[1]==BRIEF]
            self.assertIn('Dettaglio concreto',briefs[1][3])

    def test_budget_reserves_before_every_paid_call_and_stops_without_retries(self):
        cfg=config(max_generations=1,max_evaluations=2);reserved=[];b=Budget(cfg, lambda kind: reserved.append(kind) or .01)
        b.debit('evaluation');b.debit('evaluation');b.debit('generation')
        for kind in ['evaluation','regeneration','generation']:
            with self.assertRaises(PipelineStop):b.debit(kind)
        self.assertEqual(reserved,['evaluation','evaluation','generation'])
        with self.assertRaises(PipelineStop):Budget(config(run_usd=.001)).debit('evaluation')
        with self.assertRaises(PipelineStop):Budget(cfg, lambda _: (_ for _ in ()).throw(PipelineStop('Daily cap'))).debit('evaluation')

    def test_missing_config_credentials_and_safe_api_failures(self):
        with self.assertRaises(PipelineStop):OpenAI('')
        with self.assertRaises(PipelineStop):Config().validate(paid=True)
        def bad(req, timeout):raise HTTPError(req.full_url,429,'PRIVATE_SECRET',{},None)
        with self.assertRaisesRegex(PipelineStop,'HTTP 429') as error:OpenAI('PRIVATE_SECRET',bad).api('responses',{})
        self.assertNotIn('PRIVATE_SECRET',str(error.exception))
        class Response(io.BytesIO):
            def __enter__(self):return self
            def __exit__(self,*args):self.close()
        with self.assertRaisesRegex(PipelineStop,'modelli'):
            OpenAI('x',lambda *a,**k:Response(b'{"data":[]}')).check_models(config())

    def test_openai_image_endpoint_contains_only_prompt_and_parameters(self):
        observed=[]
        class Response(io.BytesIO):
            def __enter__(self):return self
            def __exit__(self,*args):self.close()
        def transport(req,timeout):
            observed.append((req.full_url,json.loads(req.data)))
            return Response(json.dumps({'data':[{'b64_json':base64.b64encode(b'fixture').decode()}]}).encode())
        self.assertEqual(OpenAI('secret',transport).generate('fixture','Creative text',{'size':'1024x1024','quality':'medium'}),b'fixture')
        self.assertTrue(observed[0][0].endswith('/images/generations'))
        self.assertEqual(set(observed[0][1]),{'model','prompt','n','size','quality'})

    def test_default_and_simulation_never_use_network_even_with_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);manifest=root/'manifest.json';manifest.write_text(json.dumps(batch(root,4)))
            with patch('pipeline.editorial.OpenAI') as paid,patch('pipeline.editorial.Remote') as remote,patch.dict(os.environ,{'OPENAI_API_KEY':'secret'}):
                self.assertEqual(main([str(manifest)]),0)
                self.assertEqual(main([str(manifest),'--simulate','--out',str(root/'out')]),0)
                paid.assert_not_called();remote.assert_not_called()
            self.assertFalse((root/'out/import-receipt.json').exists())

    def test_queue_cap_stops_before_evaluation(self):
        cfg=config(queue_limit=1);api=Oracle()
        with tempfile.TemporaryDirectory() as tmp, self.assertRaisesRegex(PipelineStop,'Coda privata'):
            execute([],Path(tmp),Path(tmp),cfg,api,Budget(cfg),pending=1)
        self.assertEqual(api.observed,[])

    def test_score_validation_never_accepts_nan_boolean_or_missing_motivation(self):
        for score in [True,float('nan'),float('inf'),-1,101]:
            with self.assertRaises(PipelineStop):evaluation(dict(scores={k:score for k in AXES},reason='x',concrete_motive='x',photographic=True))

    def test_resume_uses_saved_accepted_file_and_never_regenerates_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);rows=batch(root,2);cfg=config();api=Oracle([90,10])
            first=execute(rows,root,root/'out',cfg,api,Budget(cfg))
            self.assertEqual(first,dict(ranked=2,real=1,slop=1))
            ranking=json.loads((root/'out/ranking.json').read_text())
            calls_before=len(api.observed);generations_before=len(api.prompts)
            resumed=execute(rows,root,root/'out',cfg,api,Budget(cfg),resume=ranking)
            self.assertEqual(resumed,first)
            self.assertEqual(len(api.observed),calls_before)
            self.assertEqual(len(api.prompts),generations_before)

    def test_api_error_archives_failed_attempt_without_raw_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);cfg=config();photo=candidates(batch(root,1),root)[0]
            api=Oracle()
            api.generate=lambda *a: (_ for _ in ()).throw(PipelineStop('OpenAI HTTP 429'))
            with self.assertRaisesRegex(PipelineStop,'HTTP 429'):
                generate_slop(photo,api,cfg,Budget(cfg),root)
            record=json.loads(next((root/'attempts').glob('*.json')).read_text())
            self.assertEqual(record['status'],'error');self.assertEqual(record['error'],'OpenAI HTTP 429')
            self.assertTrue(record['prompt']);self.assertEqual(record['reference_id'],photo['id'])
