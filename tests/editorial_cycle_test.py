import base64
import contextlib
import io
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from pipeline.cycle import (initialize, freeze_brief, generate, generation_receipts, advance,
                            balance, observe, slop_manifest, admit_and_publish, FREEZE)
from pipeline.editorial import PipelineStop
from pipeline.real.contracts import digest, select
from pipeline.real.feedback import synchronize, load_history
from pipeline.real.fixtures import FixtureAPI
from pipeline.real.planning import Model
from pipeline.real.store import Store
from pipeline.v2.fixtures import picture

INTENT = dict(version='1.0.0',taxonomy_version='1.0.0',topic='animals',emotion='compassion',intensity='medium')


class API(FixtureAPI):
    def request(self, endpoint, body):
        self.calls.append((endpoint,copy.deepcopy(body)))
        if endpoint == 'images/generations':
            return dict(created=1794000000,data=[dict(b64_json=base64.b64encode(picture(len(self.calls),(96,96))).decode())]),'image-'+str(len(self.calls))
        if body['text']['format']['name'] == 'real_brief':
            context = json.loads(body['input'][0]['content'][0]['text'].split('\n')[-1])
            output = dict(brief='Everyday care in an animal shelter, with visible context.',
                strategies=dict(strategies=[dict(id='care-'+str(i),query='animal shelter care '+str(i),
                    rationale='A visible act of care') for i in range(context['strategy_count'])]),
                slop_prompts=['Photograph of a fully synthetic animal shelter care scene, variation '+str(i) for i in range(context['max_attempts'])])
            return dict(status='completed',output=[dict(content=[dict(type='output_text',text=json.dumps(output))])]),'brief-fixture'
        return FixtureAPI().request(endpoint,body)


class Site:
    def __init__(self):
        self.rows = {}; self.events = {}; self.real_ids = []; self.ai_ids = []
    def add(self,uid,origin,sha):
        if uid not in self.rows:
            self.rows[uid] = dict(id=uid,origin=origin,sha256=sha,source_sha256=sha,
                                 media_key='test/'+uid,status='pending',revision=0)
            self.events[uid] = []
            (self.real_ids if origin == 'REAL' else self.ai_ids).append(uid)
    def vote(self,uid,decision,reason=None):
        row=self.rows[uid];row['revision']+=1;row['status']=decision
        self.events[uid].append(dict(id=uid+'-'+str(row['revision']),image_id=uid,revision=row['revision'],
            decision=decision,image_sha256=row['sha256'],note=json.dumps(dict(note='Fixture owner vote',reason=reason)) if reason else 'Fixture owner vote',created_at='2026-11-06T22:00:00Z'))
    def query(self,sql,params):
        if 'editorial_cycle_admissions' in sql:return []
        row=self.rows[params[0]]
        return [dict(copy.deepcopy(e),effective_sha256=row['sha256'],effective_revision=row['revision'],effective_status=row['status']) for e in self.events[params[0]]]
    def report(self,ids):
        rows=[copy.deepcopy(self.rows[uid]) for uid in ids]
        return dict(images=rows,pending=sum(r['status']=='pending' for r in rows),published=False)
    def export(self,store,outputs):
        for row in outputs:self.add(row['id'],'AI',row['sha256'])
        return dict(ids=list(self.ai_ids))
    def sync(self,store,export):return self.report(export['ids'])
    def real(self,store,**kwargs):
        return dict(stage='awaiting_review',review_inbox=self.report(self.real_ids),
                    review_inbox_export=dict(ids=self.real_ids))


class CycleTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.store=Store(self.temp.name);self.api=API();self.site=Site()
        initialize(self.store,INTENT,model='fixture-gpt',image_model='fixture-image',run_id='full-cycle',
                   count=2,max_attempts=16,generation_usd=.1,generation_budget_usd=1.6,simulated=True)
    def model(self,store):return Model(store,'fixture-gpt',api=self.api,fixture=True)
    def prepare(self,real=10):
        freeze_brief(self.store,self.model(self.store))
        self.store.save('plan.r1.v1.0.0.json',dict(queries=[]),immutable=True)
        for n in range(real):self.site.add('real-'+str(n),'REAL',digest(n))
    def run_cycle(self,**kwargs):
        return advance(self.store,model_factory=self.model,api=self.api,inbox_api_factory=lambda:self.site,
            inbox_sync=self.site.sync,real_advance=self.site.real,manifest_factory=self.site.export,**kwargs)
    def image_calls(self):return [c for c in self.api.calls if c[0]=='images/generations']

    def test_brief_precedes_retrieval_is_cached_and_never_sees_real(self):
        self.assertEqual(self.run_cycle()['stage'],'awaiting_brief')
        self.assertFalse(self.api.calls)
        frozen=freeze_brief(self.store,self.model(self.store))
        count=len(self.api.calls)
        (self.store.folder/'retrieval').mkdir()
        self.store.save('retrieval/sentinel.json',dict(title='SECRET REAL TITLE',pixels='SECRET PIXELS'))
        self.assertEqual(frozen,freeze_brief(self.store,None));self.assertEqual(len(self.api.calls),count)
        row=generate(self.store,0,api=self.api)
        body=self.image_calls()[0][1]
        self.assertEqual(set(body),{'model','prompt','n','size','quality'})
        self.assertEqual(body['prompt'],frozen['output']['slop_prompts'][0])
        self.assertNotIn('SECRET',json.dumps(body))
        self.assertEqual(row,generate(self.store,0,api=self.api));self.assertEqual(len(self.image_calls()),1)

    def test_watch_is_bounded_and_releases_lock_between_polls(self):
        from pipeline.cycle import main
        slept=[]
        def sleep(seconds):
            with self.store.lock():slept.append(seconds)
        with patch('pipeline.cycle.advance',return_value=dict(stage='awaiting_review')) as step, \
                patch('pipeline.cycle.time.sleep',side_effect=sleep),contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(main(['watch','--out',str(self.store.folder),'--max-polls','3','--poll-seconds','1']),0)
        self.assertEqual(step.call_count,3);self.assertEqual(slept,[1,1])
        self.assertIn('poll_limit',output.getvalue());self.assertFalse(self.api.calls)

    def test_deleted_refusal_is_still_imported_into_feedback(self):
        self.prepare(1);uid=self.site.real_ids[0];self.site.vote(uid,'rejected')
        row=self.site.rows[uid]
        report=dict(images=[],deleted_images=[dict(image_id=uid,origin='REAL',sha256=row['sha256'],revision=1)])
        observed=observe(self.store,report,self.site)
        self.assertTrue(observed[0]['deleted']);self.assertEqual(observed[0]['decision'],'rejected')
        self.assertTrue(any(e['outcome']=='human_rejected' for e in synchronize(self.store)))

    def test_unverified_rights_do_not_hide_retrieved_pixels_from_personal_review(self):
        from pipeline.real.acquisition import acquire
        from pipeline.real.inbox import acquired_candidates
        calls=[]
        for include in (False,True):
            store=Store(self.store.folder/('review-first' if include else 'legacy'))
            store.freeze(INTENT,simulated=True)
            store.save('retrieval/test.json',dict(candidates=[dict(provider='commons',source_id='fixture',
                source_url='https://fixture.invalid/page',rights='Unresolved rights',author='Fixture')]))
            def download(source,client,hosts):
                calls.append(include);raw=picture(2,(96,96))
                return raw,hashlib.sha256(raw).hexdigest(),'0'*16
            result=acquire(store,['fixture.invalid'],'RealOrSlop/fixture (https://github.com/rickymusu-bit/real-or-slop)',downloader=download,include_unlicensed=include)
            if include:
                row=acquired_candidates(store)[0]
                self.assertEqual(len(result['records']),1)
                self.assertFalse(row['attestation']['rights_verified']);self.assertFalse(row['attestation']['source_verified'])
                self.assertIsNone(row['provenance']['license_url']);self.assertEqual(row['attestation']['reviewer'],'')
                self.assertIn('license_unresolved',row['blockers'])
            else:self.assertEqual(result['records'],[])
        self.assertEqual(calls,[True])

    def test_no_generation_before_site_approval_or_on_cached_votes(self):
        self.prepare(2)
        self.assertEqual(self.run_cycle(sync=True,execute=True)['target'],0)
        self.assertFalse(self.image_calls())
        for uid in self.site.real_ids:self.site.vote(uid,'approved')
        self.assertEqual(self.run_cycle(execute=True)['stage'],'awaiting_site_sync')
        self.assertFalse(self.image_calls())
        state=self.run_cycle(sync=True)
        self.assertEqual(state['stage'],'awaiting_generation');self.assertEqual(state['deficit'],2)

    def test_actual_discovery_to_site_to_generation_without_documentary_approval(self):
        from pipeline.real.workflow import advance as discovery
        from pipeline.real.fixtures import search_client
        def queue(store, rows):
            for row in rows:self.site.add(row['id'],'REAL',row['sha256'])
            export=dict(ids=self.site.real_ids)
            return export,self.site.sync(store,export)
        def real(store,**kwargs):return discovery(store,queue_adapter=queue,**kwargs)
        def download(source,client,hosts):
            raw=picture(int(source['source_id']),(128,96))
            return raw,hashlib.sha256(raw).hexdigest(),'0'*16
        def step():return advance(self.store,execute=True,live=True,sync=True,model_factory=self.model,
            client_factory=search_client,downloader=download,api=self.api,inbox_api_factory=lambda:self.site,
            inbox_sync=self.site.sync,real_advance=real,manifest_factory=self.site.export)
        first=step()
        self.assertEqual(first['stage'],'awaiting_review')
        self.assertEqual(len(self.site.real_ids),4)
        self.assertIsNone(self.store.read('documented.v1.0.0.json'))
        self.assertFalse(first['discovery']['documentary_verified'])
        self.assertFalse(self.image_calls())
        for uid in self.site.real_ids[:2]:self.site.vote(uid,'approved')
        second=step()
        self.assertEqual(second['target'],2);self.assertEqual(second['slop']['pending'],2)
        self.assertEqual(len(self.image_calls()),2)
        frozen=self.store.read(FREEZE)
        for index,call in enumerate(self.image_calls()):self.assertEqual(call[1]['prompt'],frozen['output']['slop_prompts'][index])

    def test_existing_cycle_assignment_prevents_generation_even_before_documentary_admission(self):
        self.prepare(1);uid=self.site.real_ids[0];self.site.vote(uid,'approved')
        original=self.site.query
        def assigned(sql,params):
            if 'editorial_cycle_admissions' in sql:
                return [dict(cycle_id=None,review_revision=None,image_sha256=None,published=0,assigned_cycle_id='another-cycle')]
            return original(sql,params)
        with patch.object(self.site,'query',side_effect=assigned):state=self.run_cycle(sync=True,execute=True)
        self.assertEqual(state['target'],0);self.assertFalse(self.image_calls())
        self.assertEqual(state['allocated_elsewhere']['REAL'],1)
        events=synchronize(self.store)
        latest=max(events,key=lambda row:row['revision'])
        self.assertEqual(latest['outcome'],'pending')

    def test_ten_real_seven_slop_three_rejections_generate_only_deficit(self):
        self.prepare()
        for uid in self.site.real_ids:self.site.vote(uid,'approved')
        first=self.run_cycle(sync=True,execute=True)
        self.assertEqual(first['slop']['pending'],10);self.assertEqual(len(self.image_calls()),10)
        self.run_cycle(sync=True,execute=True);self.assertEqual(len(self.image_calls()),10)
        for uid in self.site.ai_ids[:7]:self.site.vote(uid,'approved')
        for uid in self.site.ai_ids[7:10]:self.site.vote(uid,'rejected')
        waiting=self.run_cycle(sync=True)
        self.assertEqual((waiting['approved_per_origin'],waiting['real_waiting'],waiting['deficit']),(7,3,3))
        second=self.run_cycle(sync=True,execute=True)
        self.assertEqual((second['slop']['approved'],second['slop']['rejected'],second['slop']['pending']),(7,3,3))
        self.assertEqual(len(self.image_calls()),13)
        self.assertEqual(len(generation_receipts(self.store)),13)
        for uid in self.site.ai_ids[10:]:self.site.vote(uid,'approved')
        final=self.run_cycle(sync=True,execute=True)
        self.assertEqual(final['stage'],'awaiting_rights_or_publication');self.assertEqual(final['approved_per_origin'],10)
        self.assertEqual(final['publishable_per_origin'],0)  # Rights are deliberately deferred.
        self.assertFalse(final['published']);self.assertEqual(len(self.image_calls()),13)
        events=synchronize(self.store)
        self.assertTrue(any(':AI:' in e['candidate_id'] and e['outcome']=='human_rejected' for e in events))
        self.assertTrue(all(self.site.rows[uid]['status']=='approved' for uid in self.site.real_ids))

    def test_rejection_limits_pause_and_preserve_all_real_and_outputs(self):
        self.prepare(10)
        for uid in self.site.real_ids:self.site.vote(uid,'approved')
        self.run_cycle(sync=True,execute=True)
        for uid in self.site.ai_ids[:]:self.site.vote(uid,'rejected','generation')
        stopped=self.run_cycle(sync=True,execute=True)
        self.assertEqual(stopped['attempts'],16);self.assertEqual(stopped['stage'],'generation_limit_reached')
        self.assertEqual((stopped['real']['approved'],stopped['slop']['rejected'],stopped['slop']['pending']),(10,10,6))
        self.run_cycle(sync=True,execute=True);self.assertEqual(len(self.image_calls()),16)
        self.assertTrue(all((self.store.folder/r['candidate']['file']).exists() for r in generation_receipts(self.store)))

    def test_uncertain_generation_is_not_retried_and_counts_against_budget(self):
        self.prepare(1);self.site.vote(self.site.real_ids[0],'approved')
        with patch.object(self.api,'request',side_effect=TimeoutError):
            with self.assertRaises(TimeoutError):self.run_cycle(sync=True,execute=True)
        self.assertEqual(generation_receipts(self.store)[0]['status'],'uncertain')
        self.assertEqual(self.run_cycle(sync=True,execute=True)['stage'],'generation_attention_required')
        self.assertFalse(self.image_calls())
        with self.assertRaises(PipelineStop):generate(self.store,0,api=self.api)

    def test_prepared_request_is_not_submitted_after_real_approval_is_revoked(self):
        self.prepare(1);uid=self.site.real_ids[0];self.site.vote(uid,'approved')
        with patch('pipeline.cycle.DirectAPI',side_effect=PipelineStop('Fake missing credential')):
            with self.assertRaises(PipelineStop):generate(self.store,0)
        self.assertEqual(generation_receipts(self.store)[0]['status'],'prepared')
        self.site.vote(uid,'rejected')
        result=self.run_cycle(sync=True,execute=True)
        self.assertEqual(result['target'],0);self.assertFalse(self.image_calls())
        self.assertEqual(generation_receipts(self.store)[0]['status'],'prepared')

    def test_received_response_resumes_conversion_without_new_api_call(self):
        self.prepare()
        with patch('pipeline.cycle.media',side_effect=RuntimeError('simulated abrupt process exit')):
            with self.assertRaises(RuntimeError):generate(self.store,0,api=self.api)
        self.assertEqual(generation_receipts(self.store)[0]['status'],'received')
        calls=len(self.image_calls())
        self.assertIn('original_sha256',generate(self.store,0,api=self.api))
        self.assertEqual(len(self.image_calls()),calls)

    def test_publication_counts_do_not_reopen_generation_or_report_completed_as_pending(self):
        real=[dict(decision='approved',published=n<7) for n in range(10)]
        slop=[dict(decision='approved',published=True) for _ in range(7)]
        state=balance(real,slop)
        self.assertEqual((state['deficit'],state['publishable_per_origin'],state['published_per_origin'],state['real_waiting']),(3,0,7,3))
        self.assertTrue(state['published'])
        self.assertEqual(balance(real,slop+[dict(decision='pending') for _ in range(3)])['deficit'],0)

    def test_current_pixel_and_revision_are_required(self):
        self.prepare(1);uid=self.site.real_ids[0];self.site.vote(uid,'approved')
        self.site.rows[uid]['sha256']='e'*64
        state=self.run_cycle(sync=True,execute=True)
        self.assertEqual(state['target'],0);self.assertFalse(self.image_calls())
        history=synchronize(self.store)
        latest=max((e for e in history if e['candidate_id']),key=lambda e:e['revision'])
        self.assertEqual(latest['outcome'],'pending')
        report=self.site.report([uid]);report['images'][0]['revision']=5
        with self.assertRaises(PipelineStop):observe(self.store,report,self.site)
        self.site.vote(uid,'approved')
        self.assertEqual(self.run_cycle(sync=True)['target'],1)

    def test_presentation_changed_during_vote_read_cannot_authorize_generation(self):
        self.prepare(1);uid=self.site.real_ids[0];self.site.vote(uid,'approved')
        original=self.site.query
        def changing(sql,params):
            if 'editorial_review_inbox_events' in sql:self.site.rows[uid]['sha256']='d'*64
            return original(sql,params)
        with patch.object(self.site,'query',side_effect=changing):
            with self.assertRaises(PipelineStop):self.run_cycle(sync=True,execute=True)
        self.assertFalse(self.image_calls())

    def test_generator_fault_feedback_is_separate_from_editorial_rejection(self):
        self.prepare(1);uid=self.site.real_ids[0];self.site.vote(uid,'approved')
        self.run_cycle(sync=True,execute=True)
        self.site.vote(self.site.ai_ids[0],'rejected','generation')
        self.run_cycle(sync=True)
        events=synchronize(self.store)
        self.assertFalse(any(':AI:' in e['candidate_id'] and e['outcome']=='human_rejected' for e in events))
        self.site.vote(self.site.ai_ids[0],'rejected','editorial');self.run_cycle(sync=True)
        events=synchronize(self.store)
        self.assertTrue(any(':AI:' in e['candidate_id'] and e['outcome']=='human_rejected' for e in events))
        self.assertEqual(select(56,events),select(56,events+events))
        with self.assertRaises(PipelineStop):load_history(self.store.folder/'feedback-export.v1.0.0.json')

    def test_approval_revoked_during_generation_stops_surplus(self):
        self.prepare(3)
        for uid in self.site.real_ids:self.site.vote(uid,'approved')
        original=self.api.request
        def call(endpoint,body):
            result=original(endpoint,body)
            if endpoint=='images/generations':
                for uid in self.site.real_ids[1:]:
                    if self.site.rows[uid]['status']=='approved':self.site.vote(uid,'rejected')
            return result
        with patch.object(self.api,'request',side_effect=call):state=self.run_cycle(sync=True,execute=True)
        self.assertEqual(len(self.image_calls()),1);self.assertEqual(state['target'],1)

    def test_fixture_cannot_enter_real_inbox_or_publication_and_old_run_cannot_be_retrofitted(self):
        self.prepare()
        output=generate(self.store,0,api=self.api)
        with self.assertRaises(PipelineStop):slop_manifest(self.store,[output])
        with self.assertRaises(PipelineStop):admit_and_publish(self.store,'https://example.org',publish=True)
        other=Store(self.store.folder/'old');other.freeze(INTENT);(other.folder/'retrieval').mkdir()
        with self.assertRaises(PipelineStop):initialize(other,INTENT,model='gpt-6.1-terra',run_id='old')
        with self.assertRaises(PipelineStop):initialize(self.store,INTENT,model='fixture-gpt',run_id='full-cycle',simulated=True,max_attempts=1)

    def test_client_generation_gate_and_monotary_limit_are_closed(self):
        self.prepare();generate(self.store,0,api=self.api)
        cfg=self.store.read('editorial-config.v1.0.0.json');cfg['generation_budget_usd']=.1
        # Tampering with config is caught by freeze verification before workflow.
        self.store.save('editorial-config.v1.0.0.json',cfg)
        with self.assertRaises(PipelineStop):freeze_brief(self.store,None)
        with self.assertRaises(PipelineStop):generate(self.store,1,api=self.api)
        self.assertEqual(len(self.image_calls()),1)
