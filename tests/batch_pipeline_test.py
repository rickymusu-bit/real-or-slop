import base64
import contextlib
import copy
from dataclasses import replace
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from pipeline.batch import main,workspace
from pipeline.batch_engine import Engine,initialize
from pipeline.batch_fixtures import FixtureBatch
from pipeline.editorial import Config,PipelineStop,BRIEF,RUBRIC
from editorial_pipeline_test import batch,config

LICENSE={'name':'Fixture','url':'https://creativecommons.org/licenses/by/4.0/'}

class BatchPipelineTest(unittest.TestCase):
    def setup_run(self,root,n=20,cfg=None,api=None,max_bytes=50_000_000):
        cfg=cfg or config(attempts=1)
        state=initialize(batch(root,n),root,root/'out',cfg,'fixture-run',LICENSE)
        return Engine(state,root/'out',api or FixtureBatch(),max_bytes=max_bytes)
    def complete(self,engine):
        for _ in range(40):
            result=engine.tick(execute=True)
            if result['status'] in ('completed','paused','cancelled','stopped'):return result
        self.fail('Batch did not finish')

    def test_four_phases_global_ranking_twenty_and_small_batches(self):
        for count in (1,2,3,7,20):
            with self.subTest(count=count),tempfile.TemporaryDirectory() as temp:
                root=Path(temp);engine=self.setup_run(root,count);result=self.complete(engine)
                self.assertEqual(result['status'],'completed',result)
                ranked=engine.state['ranked'];self.assertEqual(len(ranked),count)
                self.assertEqual([p['role'] for p in ranked],['REAL']*((count+1)//2)+['SLOP']*(count//2))
                self.assertEqual(result['real'],(count+1)//2);self.assertEqual(result['slop'],count//2)
                self.assertEqual([len(j['items']) for j in engine.state['jobs']],[count,count//2,count//2,count//2] if count>1 else [1])
                self.assertEqual(result['calls']['evaluation'],count+2*(count//2))
                self.assertEqual(len(engine.api.batches),4 if count>1 else 1)

    def test_unordered_responses_match_ids_and_generation_is_text_only(self):
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),4);self.assertEqual(self.complete(engine)['status'],'completed')
            for job in engine.state['jobs']:
                self.assertEqual(set(job['results']),{item['custom_id'] for item in job['items']})
                for item in job['items']:
                    payload=engine._body(item)
                    if job['stage']=='generation':
                        self.assertEqual(set(payload),{'model','prompt','n','size','quality'})
                        self.assertNotIn('https://',payload['prompt']);self.assertNotIn('image',payload)
                    if job['stage']=='evaluation':
                        self.assertEqual(item['recipe']['instructions'],RUBRIC)
                        self.assertEqual(item['recipe']['context'],'')
            for record in engine.state['attempts']:
                self.assertTrue((engine.folder/record['file']).is_file())
                self.assertTrue(record['batch_jobs']);self.assertIn('generation_timestamp',record)
                self.assertIn('description',record);self.assertIn('creative_brief',record)

    def test_size_shards_wait_for_all_before_one_global_ranking(self):
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),20,max_bytes=20000)
            first=engine.tick(execute=True)
            self.assertGreater(len(first['jobs']),1)
            self.assertIsNone(engine.state['ranked'])
            result=self.complete(engine);self.assertEqual(result['status'],'completed',result)
            self.assertEqual(len(engine.state['ranked']),20)
            self.assertEqual(sum(row['role']=='REAL' for row in engine.state['ranked']),10)

    def test_resume_on_another_workspace_does_not_repeat_paid_jobs(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);engine=self.setup_run(root,2);engine.tick(execute=True)
            checkpoint=json.loads((engine.folder/'state.json').read_text());jobs=len(engine.api.batches)
            restored=Engine(checkpoint,engine.folder,engine.api)
            result=self.complete(restored);self.assertEqual(result['status'],'completed',result)
            self.assertEqual(len(engine.api.batches),jobs+3)
            self.assertEqual(restored.tick(execute=True)['status'],'completed')
            self.assertEqual(len(engine.api.batches),4)

    def test_ambiguous_submission_is_adopted_without_duplicate_or_charge(self):
        class LostResponse(FixtureBatch):
            def create_batch(self,*args):
                super().create_batch(*args)
                if len(self.batches)==1:raise PipelineStop('Network timeout')
                return list(self.batches.values())[-1]
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),2,api=LostResponse())
            first=engine.tick(execute=True);self.assertEqual(first['status'],'paused');self.assertEqual(len(engine.api.batches),1)
            self.assertEqual(engine.state['jobs'][0]['status'],'submitting')
            self.assertEqual(self.complete(engine)['status'],'completed')
            self.assertEqual(len(engine.api.batches),4)
            self.assertEqual(engine.state['calls']['evaluation'],4)

    def test_ambiguous_submission_not_found_is_never_resubmitted(self):
        class NoResponse(FixtureBatch):
            def create_batch(self,*args):raise PipelineStop('Unknown acceptance')
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),2,api=NoResponse());engine.tick(execute=True)
            for _ in range(3):self.assertEqual(engine.tick(execute=True)['status'],'paused')
            self.assertEqual(len(engine.api.batches),0);self.assertEqual(engine.state['calls']['evaluation'],2)

    def test_collect_only_cannot_submit_the_next_phase(self):
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),2);engine.tick(execute=True)
            result=engine.tick(execute=False)
            self.assertEqual(result['status'],'paused');self.assertEqual(result['stage'],'briefs')
            self.assertEqual(len(engine.api.batches),1)
            self.assertEqual(engine.state['calls']['evaluation'],2)

    def test_duplicate_unknown_or_missing_output_ids_pause(self):
        for invalid in ('duplicate','foreign','missing','line_shape','response_shape','body_shape'):
            with self.subTest(invalid=invalid),tempfile.TemporaryDirectory() as temp:
                engine=self.setup_run(Path(temp),2);engine.tick(execute=True)
                output=list(engine.api.batches.values())[0]['output_file_id'];rows=engine.api.files[output]
                if invalid=='duplicate':rows.append(copy.deepcopy(rows[0]))
                elif invalid=='foreign':rows[0]['custom_id']='foreign'
                elif invalid=='line_shape':rows[0]=[]
                elif invalid=='response_shape':rows[0]['response']='invalid'
                elif invalid=='body_shape':rows[0]['response']['body']=[]
                else:rows.clear()
                self.assertEqual(engine.tick(execute=True)['status'],'paused')
                self.assertIsNone(engine.state['ranked'])
                self.assertEqual(len(engine.api.batches),1)

    def test_expiration_keeps_successes_and_does_not_retry_completed_requests(self):
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),4);engine.tick(execute=True)
            job=list(engine.api.batches.values())[0];job['status']='expired';engine.api.files[job['output_file_id']].pop()
            result=self.complete(engine);self.assertEqual(result['status'],'completed',result)
            self.assertEqual(len(engine.state['ranked']),3)
            self.assertEqual([row['role'] for row in engine.state['ranked']],['REAL','REAL','SLOP'])
            self.assertEqual(len(engine.api.batches),4)

    def test_cancel_does_not_generate_or_refund_reservations(self):
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),2);engine.tick(execute=True)
            paid=engine.state['reserved_usd'];self.assertEqual(engine.cancel()['status'],'cancelled')
            self.assertEqual(engine.tick(execute=True)['status'],'cancelled')
            self.assertEqual(engine.state['reserved_usd'],paid);self.assertEqual(len(engine.api.batches),1)

    def test_budget_and_call_limits_prevent_submission(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=config(attempts=1,max_evaluations=2)
            engine=self.setup_run(Path(temp),2,cfg=cfg);engine.tick(execute=True)
            self.assertEqual(engine.tick(execute=True)['status'],'paused')
            self.assertEqual(len(engine.api.batches),1)
        with tempfile.TemporaryDirectory() as temp,self.assertRaises(PipelineStop):
            self.setup_run(Path(temp),20,cfg=config(run_usd=.001))

    def test_default_plan_and_simulation_never_use_paid_clients_or_remote(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);manifest=root/'manifest.json';manifest.write_text(json.dumps(batch(root,2)))
            with patch('pipeline.batch.BatchAPI') as api,patch('pipeline.batch.BatchRemote') as remote,contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(manifest)]),0)
                self.assertEqual(main([str(manifest),'--simulate','--out',str(root/'sim')]),0)
                api.assert_not_called();remote.assert_not_called()
            record=json.loads(next((root/'sim').glob('*/state.json')).read_text())
            self.assertEqual(record['config']['attempts'],1);self.assertEqual(record['calls']['generation'],1)

    def test_local_lock_rejects_overlapping_runner(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            with workspace(folder):
                with self.assertRaises(PipelineStop):
                    with workspace(folder):pass

    def test_low_quality_uses_bounded_regenerations_without_reranking(self):
        class LowQuality(FixtureBatch):
            def create_batch(self,file_id,endpoint,metadata):
                result=super().create_batch(file_id,endpoint,metadata)
                if metadata['stage']=='evaluation':
                    for row in self.files[result['output_file_id']]:
                        value=json.loads(row['response']['body']['output'][0]['content'][0]['text'])
                        value['scores']={key:10 for key in value['scores']}
                        row['response']['body']['output'][0]['content'][0]['text']=json.dumps(value)
                return result
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),4,cfg=config(attempts=2),api=LowQuality())
            result=self.complete(engine);self.assertEqual(result['status'],'completed',result)
            self.assertEqual(result['real'],2);self.assertEqual(result['slop'],0)
            self.assertEqual(result['calls']['generation'],2);self.assertEqual(result['calls']['regeneration'],2)
            self.assertEqual(len(engine.state['attempts']),4)
            self.assertEqual(sum(job['stage']=='ranking' for job in engine.state['jobs']),1)
            self.assertTrue(all(record['status']=='discarded' and record['evaluation']['score']==10 for record in engine.state['attempts']))

    def test_cancel_pending_retains_completed_generation_without_new_evaluation(self):
        class SlowCancel(FixtureBatch):
            def cancel(self,uid):self.batches[uid]['status']='cancelling';return self.retrieve(uid)
        with tempfile.TemporaryDirectory() as temp:
            api=SlowCancel();engine=self.setup_run(Path(temp),2,api=api)
            for _ in range(3):engine.tick(execute=True)
            current=list(api.batches.values())[-1];self.assertEqual(current['metadata']['stage'],'generation')
            current['status']='in_progress'
            self.assertEqual(engine.cancel()['status'],'paused')
            self.assertTrue(engine.state['cancel_pending'])
            current['status']='completed'
            self.assertEqual(engine.tick(execute=True)['status'],'cancelled')
            self.assertEqual(len(api.batches),3)
            record=engine.state['attempts'][0]
            self.assertEqual(record['status'],'cancelled');self.assertTrue((engine.folder/record['file']).is_file())
            self.assertFalse(any(job['stage']=='evaluation' for job in engine.state['jobs']))

    def test_missing_credentials_are_safe_and_status_ignores_paid_configuration(self):
        with patch.dict('os.environ',{'OPENAI_API_KEY':'','REAL_OR_SLOP_ADMIN_TOKEN':'','EDITORIAL_BATCH_EVALUATION_USD':'','EDITORIAL_BATCH_GENERATION_USD':'','EDITORIAL_THRESHOLD':'not-a-price'}),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(['--status','run-id']),1)
        with patch.dict('os.environ',{'OPENAI_API_KEY':'','REAL_OR_SLOP_ADMIN_TOKEN':'','EDITORIAL_BATCH_EVALUATION_USD':'','EDITORIAL_BATCH_GENERATION_USD':''}),patch('pipeline.batch.BatchAPI') as api,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(['--resume','run-id']),1)
            api.assert_not_called()

    def test_malformed_visual_output_pauses_before_another_paid_stage(self):
        class Malformed(FixtureBatch):
            def lines(self,file_id):
                for line in super().lines(file_id):
                    line['response']['body']['output']=[]
                    yield line
        with tempfile.TemporaryDirectory() as temp:
            engine=self.setup_run(Path(temp),2,api=Malformed())
            engine.tick(execute=True)
            result=engine.tick(execute=True)
            self.assertEqual(result['status'],'paused')
            self.assertIsNotNone(result['error'])
            self.assertEqual(len(engine.api.batches),1)
            self.assertIsNone(engine.state['ranked'])
