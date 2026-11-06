import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from pipeline.editorial import PipelineStop
from pipeline.real.benchmark import compare, summarize
from pipeline.real.acquisition import acquire
from pipeline.real.contracts import VERSION, digest, matrix, select, validate
from pipeline.real.fixtures import FixtureAPI, search_client, documentary_manifest
from pipeline.real.planning import Model, Reservation
from pipeline.real.providers import PROFILES, retrieve
from pipeline.real.review import prepare, profile, shortlist, review, latest_reviews, near_duplicates
from pipeline.real.run import plan, collect, fixture, main
from pipeline.real.store import Store
from pipeline.v2.search_sources import SearchClient

INTENT = dict(version=VERSION, taxonomy_version=VERSION, topic='animals', emotion='compassion', intensity='medium')
QUERY = dict(variants=[dict(mode='text', query='wildlife rescue', category=None, language='en')])
UA = 'RealOrSlop/test (https://github.com/rickymusu-bit/real-or-slop)'


class RealDiscoveryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = Store(self.root/'run')
        self.store.freeze(INTENT, simulated=True)

    def model(self, api=None):
        return Model(self.store, 'fixture-gpt', api or FixtureAPI(), fixture=True)

    def transport(self, opener, maximum=30):
        return SearchClient(UA, opener=opener, env={}, sleep=lambda _: None, max_calls=maximum)

    def documented(self):
        model = self.model()
        plan(self.store, model)
        results = collect(self.store, client_factory=search_client)
        hits = {(row['provider'], row['source_id']): row for result in results for row in result['candidates']}
        records = documentary_manifest(self.store, list(hits.values()))
        return model, records

    def test_matrix_neutrality_and_seeded_scheduler_without_uniform_quotas(self):
        self.assertEqual(len(matrix()), 432)
        self.assertEqual(sum(row['meaningful'] for row in matrix()), 408)
        self.assertEqual(select(56, count=48), select(56, count=48))
        self.assertEqual(len({digest(row) for row in select(56, count=48)}), 48)
        with self.assertRaises(PipelineStop):
            validate('intent', {**INTENT, 'emotion': 'neutrality'})
        self.assertEqual(validate('intent', {**INTENT, 'emotion': 'neutrality', 'intensity': 'low'})['emotion'], 'neutrality')
        with self.assertRaises(PipelineStop):
            validate('intent', {**INTENT, 'emotion': 'hope'})

    def test_retrieval_failures_never_become_human_rejections_and_replay_is_idempotent(self):
        event = dict(id='e', intent=INTENT, candidate_id='c', revision=1, outcome='provider_error')
        self.assertEqual(select(56, [event], 10), select(56, [], 10))
        event['outcome'] = 'human_rejected'
        self.assertEqual(select(56, [event, event], 10), select(56, [event], 10))
        pending = {**event, 'id': 'p', 'revision': 2, 'outcome': 'pending'}
        self.assertEqual(select(56, [pending, event], 10), select(56, [], 10))

    def test_contract_rejects_unknown_parameters_urls_ids_and_invalid_visual_numbers(self):
        for bad in [{**QUERY, 'gsrlimit': 2000}, dict(variants=[{**QUERY['variants'][0], 'source_url': 'https://evil.invalid'}]),
                    dict(variants=[{**QUERY['variants'][0], 'query': 'Q123 wildlife'}]),
                    dict(variants=[{**QUERY['variants'][0], 'mode': 'category', 'category': None}])]:
            with self.assertRaises(PipelineStop):
                validate('adaptation', bad)
        body = FixtureAPI().request('responses', dict(text=dict(format=dict(name='real_visual'))))[0]
        visual = json.loads(body['output'][0]['content'][0]['text'])
        self.assertEqual(validate('visual', visual)['emotions'], ['compassion', 'curiosity'])
        for bad in [True, float('nan'), float('inf'), -1, 101]:
            with self.assertRaises(PipelineStop):
                validate('visual', {**visual, 'attention': bad})
        with self.assertRaises(PipelineStop):
            validate('visual', {**visual, 'intended_emotion': 'compassion'})

    def test_original_slop_is_frozen_before_search_and_cannot_be_contaminated(self):
        plan_value = json.loads(Path('tests/editorial-v2-contract.json').read_text())['plan']
        other = Store(self.root/'with-slop')
        other.freeze(INTENT, plan_value)
        altered = copy.deepcopy(plan_value)
        altered['ideas'][0]['reference_id'] = 'real-image'
        with self.assertRaises(PipelineStop):
            Store(self.root/'bad').freeze(INTENT, altered)
        with self.assertRaises(PipelineStop):
            other.freeze(INTENT, None)
        empty = Store(self.root/'no-freeze')
        with self.assertRaises(PipelineStop):
            retrieve(empty, 'commons', QUERY, UA, client=search_client())
        self.assertEqual(other.frozen()['slop_plan'], plan_value)

    def test_two_structured_stages_differ_by_provider_and_reuse_cache(self):
        api = FixtureAPI(); model = self.model(api)
        first = plan(self.store, model)
        count = len(api.calls)
        self.assertEqual(count, 11)  # A once, B per strategy/provider.
        self.assertEqual(plan(self.store, model), first)
        self.assertEqual(len(api.calls), count)
        self.assertEqual(first['queries'][0]['adapted']['variants'][0]['query'], 'animal rescue flood')
        self.assertEqual(first['queries'][1]['adapted']['variants'][0]['query'], 'wildlife rescue')
        for body in api.calls:
            self.assertFalse(body['store'])
            self.assertEqual(body['text']['format']['type'], 'json_schema')
            self.assertNotIn('tools', body)
        model.strategies(revision=2)
        self.assertEqual(len(api.calls), count+1)
        self.assertEqual(len(list((self.store.folder/'requests').glob('*.json'))), count+1)

    def test_invalid_or_uncertain_model_response_is_archived_without_implicit_retry(self):
        class Broken:
            calls = 0
            def request(inner, endpoint, body):
                inner.calls += 1
                raise OSError('PRIVATE_TOKEN')
        api = Broken(); model = self.model(api)
        with self.assertRaises(OSError):
            model.strategies()
        with self.assertRaises(PipelineStop):
            model.strategies()
        self.assertEqual(api.calls, 1)
        raw = ''.join(p.read_text() for p in (self.store.folder/'requests').glob('*.json'))
        self.assertNotIn('PRIVATE_TOKEN', raw)
        class Invalid:
            def request(inner, endpoint, body):
                return dict(status='completed', output=[dict(content=[dict(type='output_text', text='{"http_params":{}}')])]), 'req'
        other = Store(self.root/'invalid'); other.freeze(INTENT, simulated=True)
        with self.assertRaises(PipelineStop):
            Model(other, 'fixture', Invalid(), fixture=True).strategies()
        self.assertEqual(other.read('requests/'+next((other.folder/'requests').glob('*.json')).stem+'.json')['status'], 'invalid')

    def test_paid_execution_requires_client_gate_server_reservation_and_non_fixture_freeze(self):
        real = Store(self.root/'real'); real.freeze(INTENT)
        with patch.dict(os.environ, {'ENABLE_REAL_DISCOVERY_PAID': ''}):
            with self.assertRaises(PipelineStop):
                Model(real, 'gpt-6.1-terra', FixtureAPI())
        with self.assertRaises(PipelineStop):
            Model(self.store, 'gpt-6.1-terra', FixtureAPI(), reservation=object())
        reservation = Reservation('http://127.0.0.1:8787', 'fixture-token', 'run')
        with patch('pipeline.real.planning.request', return_value=dict(reserved_usd=.01, already_reserved=True)):
            with self.assertRaises(PipelineStop):
                reservation.reserve('a'*64, 'strategies', 'gpt-6.1-terra')

    def test_zero_hits_and_ratelimit_remain_distinct_no_implicit_retry(self):
        calls = []
        def opener(request, timeout):
            calls.append(request)
            return io.BytesIO(b'{"results":[],"next":null}')
        result = retrieve(self.store, 'openverse', QUERY, UA, client=self.transport(opener))
        self.assertEqual(result['status'], 'zero_hits')
        self.assertEqual(result['variant_logs'][0]['returned'], 0)
        retrieve(self.store, 'openverse', QUERY, UA, client=self.transport(opener))
        self.assertEqual(len(calls), 1)
        def limited(request, timeout):
            raise HTTPError(request.full_url, 429, 'PRIVATE_TOKEN', {'Retry-After': '12'}, None)
        result = retrieve(self.store, 'commons', QUERY, UA, client=self.transport(limited))
        self.assertEqual(result['status'], 'rate_limited')
        self.assertEqual(result['variant_logs'][0]['retry_after'], '12')
        self.assertIsNone(result['variant_logs'][0]['returned'])
        self.assertNotIn('PRIVATE_TOKEN', json.dumps(result))

    def test_provider_specific_http_filters_and_pagination_are_code_controlled(self):
        requests = []
        def opener(request, timeout):
            requests.append(parse_qs(urlsplit(request.full_url).query))
            return io.BytesIO(json.dumps(dict(results=[], next='https://evil.invalid/' if len(requests) == 1 else None)).encode())
        retrieve(self.store, 'openverse', QUERY, UA, client=self.transport(opener), page_size=7, max_pages=2)
        self.assertEqual([r['page'] for r in requests], [['1'], ['2']])
        self.assertEqual(requests[0]['license'], ['by,by-sa,cc0,pdm'])
        self.assertEqual(requests[0]['page_size'], ['7'])
        with self.assertRaises(PipelineStop):
            retrieve(self.store, 'openverse', dict(variants=[dict(mode='category', category='Category:Animals', query='animals', language='en')]), UA)

    def test_missing_commons_category_falls_back_to_text_but_existing_category_is_resolved(self):
        for exists in (False, True):
            store = Store(self.root/str(exists)); store.freeze(INTENT, simulated=True)
            requests = []
            def opener(request, timeout):
                params = parse_qs(urlsplit(request.full_url).query); requests.append(params)
                if 'titles' in params:
                    page = dict(title='Category:Animal rescue', ns=14, pageid=10) if exists else dict(missing='', ns=14)
                    return io.BytesIO(json.dumps(dict(query=dict(pages={'10': page}))).encode())
                return io.BytesIO(b'{}')
            query = dict(variants=[dict(mode='category', query='animal rescue flood', category='Category:Animal rescue', language='en')])
            result = retrieve(store, 'commons', query, UA, client=self.transport(opener))
            self.assertEqual(result['variant_logs'][0]['category_resolution'], 'verified' if exists else 'missing_text_fallback')
            self.assertEqual(requests[1]['generator'], ['categorymembers' if exists else 'search'])
            if exists:
                self.assertEqual(requests[1]['gcmtype'], ['file'])

    def test_partial_results_survive_next_page_failure_and_other_provider_still_runs(self):
        calls = []
        def opener(request, timeout):
            calls.append(request)
            if len(calls) == 2:
                raise HTTPError(request.full_url, 503, 'fail', {}, None)
            return io.BytesIO(json.dumps(dict(results=[dict(id='one', creator='author', title='photo',
                url='https://source.invalid/a.jpg', foreign_landing_url='https://source.invalid/page')], next='next')).encode())
        result = retrieve(self.store, 'openverse', QUERY, UA, client=self.transport(opener), max_pages=2)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(len(result['candidates']), 1)
        self.assertEqual(result['api_calls'], 2)
        again = retrieve(self.store, 'openverse', QUERY, UA, client=self.transport(opener), max_pages=2)
        self.assertEqual(again, result); self.assertEqual(len(calls), 2)
        commons = retrieve(self.store, 'commons', QUERY, UA, client=search_client())
        self.assertEqual(commons['status'], 'completed')

    def test_durable_total_call_allowance_and_interrupted_receipt(self):
        first = retrieve(self.store, 'openverse', QUERY, UA, client=search_client(), max_calls=1)
        self.assertEqual(first['api_calls'], 1)
        second = retrieve(self.store, 'commons', QUERY, UA, client=search_client(), max_calls=1)
        self.assertEqual(second['status'], 'error')
        self.assertEqual(second['variant_logs'][0]['reason'], 'call_limit')
        with self.assertRaises(PipelineStop):
            retrieve(self.store, 'commons', QUERY, UA, client=search_client(), max_calls=2, revision=2)
        path = next((self.store.folder/'retrieval').glob('*.json'))
        value = self.store.read(str(path.relative_to(self.store.folder)))
        value['status'] = 'started'; self.store.save(str(path.relative_to(self.store.folder)), value)
        got = retrieve(self.store, value['identity']['provider'], value['identity']['adapted'], UA, client=search_client(), max_calls=1)
        self.assertEqual(got['status'], 'uncertain')

    def test_documentary_blockers_keep_ambiguous_license_and_origin_private(self):
        model, records = self.documented()
        records[0]['provenance']['license_url'] = None
        records[1]['provenance']['authenticity'] = 'uncertain'
        records[2]['attestation']['rights_verified'] = False
        prepared = prepare(self.store, records, self.store.folder)
        self.assertEqual(prepared[0]['blockers'], ['license_unresolved'])
        self.assertEqual(prepared[1]['blockers'], ['origin_unverified'])
        count = len(model.api.calls)
        rows = profile(self.store, model)
        self.assertEqual(len(model.api.calls)-count, 5)
        self.assertTrue(all('visual' not in row for row in rows[:3]))
        for bad in [dict(candidate_id=rows[0]['id'], sha256=rows[0]['sha256'], decision='approved', reviewer='owner', revision=1, confirm_reviewed=True)]:
            with self.assertRaises(PipelineStop):
                review(self.store, rows, [bad])

    def test_profiles_are_blind_and_slop_payload_is_never_generated(self):
        model, records = self.documented()
        records[0]['provenance']['author'] = 'PRIVATE_AUTHOR_DO_NOT_LEAK'
        prepare(self.store, records, self.store.folder)
        before = len(model.api.calls)
        rows = profile(self.store, model)
        for body in model.api.calls[before:]:
            texts = [p['text'] for msg in body['input'] for p in msg['content'] if p['type'] == 'input_text']
            self.assertNotIn('PRIVATE_AUTHOR_DO_NOT_LEAK', ''.join(texts))
            self.assertNotIn('fixture.invalid', ''.join(texts))
            self.assertNotIn('"intent"', ''.join(texts))
            self.assertNotIn('input_image', json.dumps(body['text']))
        self.assertTrue(all(row['profile_image_sha256'] == row['sha256'] for row in rows))
        self.assertIsNone(self.store.frozen()['slop_plan'])
        self.assertTrue(all(row['review_state'] == 'pending' for row in rows))

    def test_shortlist_uses_all_profiles_and_human_review_is_hash_bound_and_separate(self):
        model, records = self.documented(); prepare(self.store, records, self.store.folder)
        rows = profile(self.store, model)
        rows[-1]['visual']['attention'] = 99
        chosen = shortlist(rows)
        self.assertEqual(len(chosen['shortlisted']), 5)
        self.assertEqual(chosen['shortlisted'][0], rows[-1]['id'])
        self.assertEqual(len(shortlist(rows[:2])['shortlisted']), 2)
        decision = dict(candidate_id=rows[0]['id'], sha256=rows[0]['sha256'], decision='approved', reviewer='fixture owner', revision=1, confirm_reviewed=True)
        self.assertFalse(review(self.store, rows, [decision])['published'])
        review(self.store, rows, [decision])
        with self.assertRaises(PipelineStop):
            review(self.store, rows, [{**decision, 'sha256': '0'*64, 'revision': 2}])
        review(self.store, rows, [{**decision, 'decision': 'pending', 'revision': 2}])
        self.assertEqual(latest_reviews(self.store)[rows[0]['id']]['decision'], 'pending')
        with self.assertRaises(PipelineStop):
            review(self.store, rows, [{**decision, 'revision': 4}])

    def test_original_sha_and_dossier_source_binding_before_visual_evaluation(self):
        model, records = self.documented()
        records[0]['sha256'] = '0'*64
        with self.assertRaises(PipelineStop):
            prepare(self.store, records, self.store.folder)
        records[0]['sha256'] = hashlib.sha256((self.store.folder/records[0]['file']).read_bytes()).hexdigest()
        records[0]['provenance']['source_id'] = 'not-in-this-run'
        with self.assertRaises(PipelineStop):
            prepare(self.store, records, self.store.folder)
        records[0]['id'] = '../escape'
        with self.assertRaises(PipelineStop):
            prepare(self.store, records, self.store.folder)

    def test_similarity_reuses_existing_dino_contract_as_review_suggestions(self):
        model, records = self.documented(); prepare(self.store, records, self.store.folder)
        rows = profile(self.store, model)[:2]
        for index, row in enumerate(rows):
            row['features'] = dict(version='dinov2-small-q8-cls-v1', sha256=row['sha256'],
                dhash='0'*16 if index == 0 else 'f'*16, embedding=[1]+[0]*383)
        suggestions = near_duplicates(rows)
        self.assertEqual(suggestions[0]['reason'], 'visual')
        self.assertFalse(suggestions[0]['automatic_rejection'])
        rows[0]['features']['sha256'] = 'a'*64
        with self.assertRaises(PipelineStop):
            near_duplicates(rows)

    def test_fixture_benchmark_is_repeatable_and_never_claims_human_efficacy(self):
        root = self.root/'study'
        first = fixture(root)
        again = fixture(root)
        self.assertEqual(first, again)
        self.assertFalse(first['effectiveness_claim'])
        self.assertEqual(first['baseline']['human_judged'], 0)
        self.assertTrue(first['equal_request_allowance'])
        adapted = Store(root/'adapted')
        adapted.save('retrieval-policy.v1.0.0.json', dict(max_calls=99))
        with self.assertRaises(PipelineStop):
            compare(Store(root/'baseline'), adapted)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(['export', '--out', str(root/'baseline')]), 1)

    def test_default_cli_inspection_does_not_create_an_api_client(self):
        with patch('pipeline.real.run.Model', side_effect=AssertionError('API should not be constructed')):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(['plan', '--out', str(self.store.folder)]), 0)
                self.assertEqual(main(['retrieve', '--out', str(self.store.folder)]), 0)
        self.assertEqual(list((self.store.folder/'requests').glob('*.json')), [])

    def test_explicit_acquisition_preserves_originals_and_never_attests_rights_or_origin(self):
        self.documented()
        calls = []
        from pipeline.v2.fixtures import picture
        raw = picture(90, (128, 96))
        def download(row, client, hosts):
            calls.append(row)
            self.assertEqual(hosts, ['fixture.invalid'])
            return raw, hashlib.sha256(raw).hexdigest(), '0'*16
        result = acquire(self.store, ['fixture.invalid'], UA, maximum=2, downloader=download)
        self.assertEqual(len(calls), 2)
        self.assertEqual(len(result['records']), 2)
        self.assertFalse(result['verified'])
        for row in result['records']:
            self.assertEqual((self.store.folder/row['file']).read_bytes(), raw)
            self.assertFalse(row['attestation']['source_verified'])
            self.assertFalse(row['attestation']['rights_verified'])
            self.assertEqual(row['provenance']['authenticity'], 'unverified')
        editable = Path(result['editable_manifest'])
        editable.write_text('[]')
        acquire(self.store, ['fixture.invalid'], UA, maximum=2, downloader=download)
        self.assertEqual(len(calls), 2)
        self.assertEqual(editable.read_text(), '[]')

    def test_unreachable_acquisition_is_retained_without_silent_retry(self):
        self.documented()
        def failed(*args):
            raise OSError('private URL or token')
        result = acquire(self.store, ['fixture.invalid'], UA, maximum=1, downloader=failed)
        self.assertEqual(result['outcomes'], ['error'])
        self.assertEqual(result['records'], [])
        with patch('pipeline.real.acquisition.download', side_effect=AssertionError('no implicit retry')):
            self.assertEqual(acquire(self.store, ['fixture.invalid'], UA, maximum=1, downloader=failed)['outcomes'], ['error'])
        with self.assertRaises(PipelineStop):
            acquire(self.store, ['https://fixture.invalid'], UA, downloader=failed)

    def test_unreviewed_benchmark_never_reports_unknown_approvals_as_zero(self):
        model, records = self.documented(); prepare(self.store, records, self.store.folder)
        profile(self.store, model)
        summary = summarize(self.store)
        self.assertIsNone(summary['approved'])
        self.assertIsNone(summary['approved_per_api_call'])

    def test_shortlist_preserves_exact_duplicates_as_private_records(self):
        model, records = self.documented()
        # Same bytes, distinct source and candidate IDs.
        records[1]['file'] = records[0]['file']; records[1]['sha256'] = records[0]['sha256']
        rows = prepare(self.store, records, self.store.folder)
        self.assertEqual(rows[1]['duplicate_of'], rows[0]['id'])
        rows = profile(self.store, model)
        self.assertEqual(len(rows), 8)
        self.assertNotIn(rows[1]['id'], shortlist(rows)['shortlisted'])

    def test_original_tampering_after_documentation_blocks_profiling(self):
        model, records = self.documented()
        rows = prepare(self.store, records, self.store.folder)
        (self.store.folder/rows[0]['file']).write_bytes(b'changed')
        calls = len(model.api.calls)
        with self.assertRaises(PipelineStop):
            profile(self.store, model)
        self.assertEqual(len(model.api.calls), calls)

    def test_collection_stops_rate_limited_provider_and_keeps_other_source(self):
        plan(self.store, self.model(), baseline=True)
        calls = []
        def opener(request, timeout):
            calls.append(request.full_url)
            if 'commons.wikimedia.org' in request.full_url:
                raise HTTPError(request.full_url, 429, 'limited', {'Retry-After': '60'}, None)
            return io.BytesIO(b'{"results":[],"next":null}')
        collect(self.store, client_factory=lambda maximum: self.transport(opener, maximum))
        self.assertEqual(sum('commons.wikimedia.org' in url for url in calls), 1)
        self.assertEqual(sum('api.openverse.org' in url for url in calls), 5)
        self.assertEqual(len(self.store.read('collection.r1.v1.0.0.json')['skipped']), 4)


if __name__ == '__main__':
    unittest.main()
