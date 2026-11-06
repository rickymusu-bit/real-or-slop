import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from pipeline.editorial import PipelineStop
from pipeline.real.contracts import digest, select
from pipeline.real.benchmark import summarize
from pipeline.real.feedback import synchronize, load_history
from pipeline.real.fixtures import FixtureAPI, search_client
from pipeline.real.gallery import render
from pipeline.real.planning import Model
from pipeline.real.pilot import prepare_pilot, evaluate_pilot, verify_workload
from pipeline.real.review import prepare, profile, profile_path, document_path, latest_reviews, review
from pipeline.real.run import plan, compile_query
from pipeline.real.store import Store
from pipeline.real.workflow import initialize, advance, handoff
from pipeline.v2.fixtures import picture

INTENT = dict(version='1.0.0', taxonomy_version='1.0.0', topic='animals', emotion='compassion', intensity='medium')


class WorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.store = Store(self.root/'cycle')
        self.api = FixtureAPI(); self.downloads = []
        initialize(self.store, INTENT, model='fixture-gpt', run_id='cycle', providers=['commons'],
                   count=2, download_hosts=['fixture.invalid'], simulated=True)

    def model(self, store):
        return Model(store, 'fixture-gpt', self.api, fixture=True)

    def download(self, source, client, hosts):
        self.downloads.append(source['source_id'])
        raw = picture(int(source['source_id']), (128, 96))
        return raw, hashlib.sha256(raw).hexdigest(), '0'*16

    def acquire(self):
        return advance(self.store, live=True, execute=True, model_factory=self.model,
                       client_factory=search_client, downloader=self.download)

    def documents(self):
        value = json.loads((self.store.folder/'documentary-input.r1.v1.0.0.json').read_text())
        for row in value:
            row['attestation'].update(reviewer='SYNTHETIC FIXTURE', verified_at='2026-11-06T18:00:00Z',
                                      source_verified=True, rights_verified=True)
            row['provenance']['authenticity'] = 'verified'
        path = self.store.folder/'fixture-documents.json'; path.write_text(json.dumps(value))
        return path, value

    def profiled(self):
        self.acquire(); path, _ = self.documents()
        return advance(self.store, documents=path, execute=True, model_factory=self.model)

    def test_gates_wait_without_constructing_model_or_contacting_sources(self):
        def forbidden(*args):
            raise AssertionError('Unexpected side effect')
        result = advance(self.store, live=True, model_factory=forbidden, client_factory=forbidden)
        self.assertEqual(result['stage'], 'awaiting_query_generation')
        self.assertEqual(self.api.calls, [])
        with self.assertRaises(PipelineStop):
            initialize(self.store, INTENT, model='fixture-gpt', run_id='cycle', providers=['openverse'], simulated=True)
        self.assertEqual(self.api.calls, [])

    def test_complete_cycle_resumes_through_documents_profiles_and_individual_review(self):
        first = self.acquire()
        self.assertEqual(first['stage'], 'awaiting_documents')
        self.assertEqual(len(self.api.calls), 3)  # A + two Commons B calls, no visual call.
        self.assertEqual(len(self.downloads), 4)
        path, records = self.documents()
        waiting = advance(self.store, documents=path)
        self.assertEqual(waiting['stage'], 'awaiting_visual_profile')
        measurements = summarize(self.store)
        self.assertEqual(measurements['by_provider']['commons']['documented'], 4)
        self.assertEqual(measurements['documentary_eligible'], 4)
        self.assertEqual(len(self.api.calls), 3)
        ready = advance(self.store, execute=True, model_factory=self.model)
        self.assertEqual(ready['stage'], 'awaiting_review')
        self.assertEqual(len(ready['shortlist']), 4)
        self.assertEqual(ready['approved'], 0)
        self.assertEqual(len(self.api.calls), 7)
        self.assertEqual(advance(self.store)['stage'], 'awaiting_review')
        self.assertEqual(len(self.api.calls), 7)
        rows = self.store.read(profile_path())
        choices = [dict(candidate_id=row['id'], sha256=row['sha256'], decision='approved',
                        reviewer='SYNTHETIC FIXTURE', revision=1, confirm_reviewed=True) for row in rows]
        file = self.store.folder/'fixture-decisions.json'; file.write_text(json.dumps(choices))
        complete = advance(self.store, decisions=file)
        self.assertEqual(complete['stage'], 'completed')
        self.assertEqual(complete['approved'], 4)
        self.assertFalse(complete['published'])
        self.assertEqual(len(list(self.store.folder.glob('approved-manifest.*'))), 0)
        self.assertEqual(len(self.api.calls), 7)
        events = synchronize(self.store, rows)
        self.assertEqual(events, synchronize(self.store, rows))
        self.assertEqual(sum(e['outcome'] == 'human_approved' for e in events), 4)
        with self.assertRaises(PipelineStop):
            load_history(self.store.folder/'feedback-export.v1.0.0.json')

    def test_same_pixel_document_revision_reuses_profiles_and_preserves_history(self):
        self.profiled()
        old = self.store.read(document_path())
        old_bytes = (self.store.folder/old[0]['file']).read_bytes()
        path, records = self.documents()
        records[0]['attestation']['reviewer'] = 'REVISED SYNTHETIC EVIDENCE'
        path.write_text(json.dumps(records))
        with self.assertRaises(PipelineStop):
            prepare(self.store, records, self.store.folder)
        self.assertEqual((self.store.folder/old[0]['file']).read_bytes(), old_bytes)
        count = len(self.api.calls)
        state = advance(self.store, documents=path, document_revision=2, execute=True, model_factory=self.model)
        self.assertEqual(state['stage'], 'awaiting_review')
        self.assertEqual(len(self.api.calls), count)
        self.assertEqual(self.store.read(document_path()), old)
        self.assertNotEqual(self.store.read(document_path(2))[0]['file'], old[0]['file'])
        advance(self.store, execute=True, profile_revision=2, model_factory=self.model)
        measurements = summarize(self.store, 2, 2, retrieval_revision=1)
        self.assertEqual(len(measurements['strategies']['strategies']), 2)
        self.assertEqual(measurements['proposed_queries'], 2)

    def test_changed_pixels_have_new_profile_and_do_not_inherit_approval(self):
        self.profiled()
        old = self.store.read(profile_path())
        first = old[0]
        review(self.store, old, [dict(candidate_id=first['id'], sha256=first['sha256'], decision='approved',
                                   reviewer='SYNTHETIC FIXTURE', revision=1, confirm_reviewed=True)])
        old_file = self.store.folder/first['file']; old_bytes = old_file.read_bytes()
        path, records = self.documents()
        image = self.store.folder/'new-pixels.png'; raw = picture(90, (128, 96)); image.write_bytes(raw)
        records[0].update(file=image.name, sha256=hashlib.sha256(raw).hexdigest())
        path.write_text(json.dumps(records)); count = len(self.api.calls)
        state = advance(self.store, documents=path, document_revision=2, execute=True, model_factory=self.model)
        self.assertEqual(len(self.api.calls), count+1)
        self.assertEqual(old_file.read_bytes(), old_bytes)
        self.assertEqual(state['approved'], 0)
        self.assertEqual(state['stage'], 'awaiting_review')

    def test_documentary_failures_are_distinct_from_human_rejections(self):
        self.acquire(); path, records = self.documents()
        for row in records:
            row['attestation']['rights_verified'] = False
            row['provenance']['authenticity'] = 'uncertain'
        path.write_text(json.dumps(records))
        result = advance(self.store, documents=path, execute=True, model_factory=self.model)
        self.assertEqual(result['stage'], 'documentary_attention_required')
        self.assertEqual(len(self.api.calls), 3)
        events = synchronize(self.store, self.store.read(document_path()))
        self.assertEqual({e['outcome'] for e in events}, {'license_unresolved', 'origin_unverified'})
        self.assertEqual(select(56, events, 10), select(56, [], 10))

    def test_provider_denial_stops_source_without_downloading_or_rejecting_humans(self):
        def denied(maximum):
            client = search_client(maximum)
            def opener(request, timeout):
                raise HTTPError(request.full_url, 403, 'blocked', {}, io.BytesIO())
            client.opener = opener
            return client
        result = advance(self.store, execute=True, live=True, model_factory=self.model,
                         client_factory=denied, downloader=self.download)
        self.assertEqual(result['stage'], 'provider_attention_required')
        self.assertEqual(self.downloads, [])
        events = synchronize(self.store)
        self.assertEqual({e['outcome'] for e in events}, {'provider_error'})

    def test_gallery_preserves_local_pixels_and_safely_exports_hash_bound_choices(self):
        state = self.profiled()
        rows = self.store.read(profile_path())
        rows[0]['title'] = '</script><script>alert(1)</script>@@DATA@@'
        rows[0]['provenance']['source_url'] = 'javascript:alert(1)'
        output = render(self.store, rows, state['shortlist'])
        text = Path(output['html']).read_text()
        self.assertIn('Simulazione', text)
        self.assertNotIn('<script>alert(1)</script>', text)
        self.assertNotIn('href="javascript:', text)
        block = re.search(r'<script id="records" type="application/json">(.*?)</script>', text, re.S)[1]
        data = json.loads(block)
        self.assertEqual(data[0]['title'], rows[0]['title'])
        self.assertEqual(data[0]['sha256'], rows[0]['sha256'])
        self.assertTrue(data[0]['can_review'])
        self.assertFalse(output['published'])

    def test_positive_feedback_without_decisions_does_not_create_approvals(self):
        state = self.profiled()
        self.assertEqual(state['approved'], 0)
        self.assertEqual(latest_reviews(self.store), {})
        self.assertEqual(synchronize(self.store), [])
        with self.assertRaises(PipelineStop):
            handoff(self.store, self.store.read(profile_path()), {})

    def test_real_handoff_requires_current_profile_and_preserves_documentary_audit(self):
        self.profiled()
        rows = self.store.read(profile_path())
        # Test-only non-fixture store: no HTTP, model, human or production action.
        target = Store(self.root/'handoff-test')
        target.freeze(INTENT, simulated=False)
        import shutil
        shutil.copytree(self.store.folder/'inputs', target.folder/'inputs')
        row = rows[0]
        choices = {row['id']: dict(candidate_id=row['id'], sha256=row['sha256'], decision='approved',
                   reviewer='SYNTHETIC UNIT TEST', revision=1, confirm_reviewed=True)}
        output = handoff(target, rows, choices)
        exported = json.loads(Path(output['manifest']).read_text())
        self.assertEqual([entry['id'] for entry in exported], [row['id']])
        self.assertTrue(output['catalog_review_required'])
        self.assertFalse(output['published'])
        audit = target.read(next(target.folder.glob('handoff.*.json')).name)['audit'][0]
        self.assertEqual(audit['attestation'], row['attestation'])
        changed = copy.deepcopy(rows); changed[0]['profile_image_sha256'] = '0'*64
        with self.assertRaises(PipelineStop):
            handoff(target, changed, choices)

    def test_provider_selection_and_bitmap_filter_do_not_mutate_model_output(self):
        with self.store.lock():
            saved = plan(self.store, self.model(self.store), count=2, providers=['commons'])
        self.assertEqual({q['provider'] for q in saved['queries']}, {'commons'})
        raw = copy.deepcopy(saved['queries'][0]['adapted'])
        compiled = compile_query('commons', raw, True)
        self.assertTrue(compiled['variants'][0]['query'].endswith('filetype:bitmap'))
        self.assertFalse(raw['variants'][0]['query'].endswith('filetype:bitmap'))
        before = len(self.api.calls)
        with self.assertRaises(PipelineStop):
            plan(self.store, self.model(self.store), providers=['openverse'])
        self.assertEqual(len(self.api.calls), before)

    def test_two_stage_pilot_records_genuine_client_outputs_and_rejects_manual_edits(self):
        cells = json.loads(Path('data/editorial/commons-benchmark.v1.1.0.json').read_text())['cells'][:2]
        folder = self.root/'pilot'
        workload = prepare_pilot(folder, cells, self.model, model='fixture-gpt', run_id='pilot', simulated=True)
        self.assertEqual(len(self.api.calls), 6)
        self.assertEqual(len(workload['model_receipts']), 6)
        self.assertTrue(verify_workload(workload))
        again = prepare_pilot(folder, cells, self.model, model='fixture-gpt', run_id='pilot', simulated=True)
        self.assertEqual(again, workload)
        self.assertEqual(len(self.api.calls), 6)
        def source(*args, **kwargs):
            from pipeline.real.providers import retrieve
            return retrieve(*args, **kwargs, client=search_client(kwargs['max_calls']))
        with contextlib.redirect_stdout(io.StringIO()):
            result = evaluate_pilot(folder, workload, source)
        self.assertTrue(result['simulated'])
        self.assertEqual(result['retrieval']['summary']['general']['api_calls'], 4)
        self.assertEqual(result['retrieval']['summary']['adapted']['api_calls'], 2)
        self.assertIsNone(result['quality'][0]['measurements']['approved'])
        changed = copy.deepcopy(workload); changed['cells'][0]['queries'][0]['adapted'] = 'manually edited query'
        with self.assertRaises(PipelineStop):
            verify_workload(changed)
        changed = copy.deepcopy(workload); changed['cells'][0]['emotion'] = 'wonder'
        with self.assertRaises(PipelineStop):
            verify_workload(changed)


if __name__ == '__main__':
    unittest.main()
