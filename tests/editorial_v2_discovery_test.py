import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from pipeline.editorial import PipelineStop
from pipeline.providers import candidate
from pipeline.v2.discovery import collect, plan
from pipeline.v2.search_sources import SearchClient, OpenverseSearch, BraveImageSearch, DEFAULT_ENGINES

UA = 'RealOrSlop/0.15 (https://github.com/rickymusu-bit/real-or-slop)'
FREE = dict(generator='fixture-independent', queries=['quiet repairs', 'surface in daylight', 'a shared gesture', 'routine work'])


def response(value):
    return io.BytesIO(json.dumps(value).encode())


class DiscoveryV2Test(unittest.TestCase):
    def test_default_plan_uses_all_source_channels_and_equal_query_allocations(self):
        value = plan(34, FREE, count=6)
        self.assertEqual({q['engine'] for q in value['queries']}, set(DEFAULT_ENGINES))
        self.assertEqual(len(value['queries']), 36)
        for engine in DEFAULT_ENGINES:
            self.assertEqual([q['query'] for q in value['queries'] if q['engine'] == engine],
                             [q['query'] for q in value['queries'] if q['engine'] == 'openverse'])
        self.assertTrue(any(q['channel'] == 'exploration' for q in value['queries']))

    def test_oauth_is_cached_and_credentials_are_not_sent_to_other_hosts(self):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            if request.full_url.endswith('/auth_tokens/token/'):
                self.assertEqual(parse_qs(request.data.decode())['grant_type'], ['client_credentials'])
                return response(dict(access_token='PRIVATE_TOKEN', expires_in=3600))
            return response(dict(results=[]))

        client = SearchClient(UA, env=dict(OPENVERSE_CLIENT_ID='PRIVATE_ID', OPENVERSE_CLIENT_SECRET='PRIVATE_SECRET'),
                              opener=opener, delay=0)
        for _ in range(2):
            list(OpenverseSearch(('flickr',)).search(client, 'reflection', 30))
        client.get('https://commons.wikimedia.org/w/api.php?action=query')
        self.assertEqual(len(calls), 4)
        self.assertEqual(calls[1].get_header('Authorization'), 'Bearer PRIVATE_TOKEN')
        self.assertIsNone(calls[-1].get_header('Authorization'))
        self.assertEqual(parse_qs(urlsplit(calls[1].full_url).query)['source'], ['flickr'])
        self.assertEqual(parse_qs(urlsplit(calls[1].full_url).query)['page_size'], ['20'])
        client.token_until = 0
        list(OpenverseSearch().search(client, 'reflection', 10))
        self.assertEqual(len(calls), 6)
        with self.assertRaises(PipelineStop):
            client.get('https://untrusted.invalid/redirect')
        self.assertEqual(len(calls), 6)

    def test_provider_403_does_not_stop_other_sources_or_turn_failure_into_zero_results(self):
        calls = []

        class Source:
            def search(self, client, query, limit):
                client.get('https://api.openverse.org/v1/images/?q=fixture')
                yield candidate('fixture', 'one', 'Photograph', 'https://source.invalid/one', 'https://source.invalid/one.jpg',
                                'Fixture author', 'https://creativecommons.org/publicdomain/zero/1.0/', '{}')

        class Broken:
            def search(self, client, query, limit):
                client.get('https://commons.wikimedia.org/w/api.php?action=query')
                return iter(())

        def opener(request, timeout):
            calls.append(request)
            if 'commons.wikimedia.org' in request.full_url:
                raise HTTPError(request.full_url, 403, 'PRIVATE_SECRET', {}, io.BytesIO(b'PRIVATE_SECRET'))
            return response({})

        search_plan = plan(34, FREE, engines=('broken', 'working'), count=4)
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            client = SearchClient(UA, opener=opener, env={}, delay=0)
            first = collect(search_plan, folder, UA, searchers=dict(broken=Broken(), working=Source()), client=client)
            self.assertEqual(first['candidates'], 1)
            journal = json.loads((folder / 'queries.json').read_text())
            failure = next(r for r in journal['queries'] if r['status'] == 'error')
            self.assertEqual(failure['http_status'], 403)
            self.assertIsNone(failure['returned'])
            self.assertIsNone(failure['examined'])
            self.assertNotIn('PRIVATE_SECRET', (folder / 'queries.json').read_text())
            self.assertEqual(sum('commons.wikimedia.org' in r.full_url for r in calls), 1)
            count = len(calls)
            again = collect(search_plan, folder, UA, searchers=dict(broken=Broken(), working=Source()),
                            client=SearchClient(UA, opener=opener, env={}, delay=0))
            self.assertEqual(first, again)
            self.assertEqual(len(calls), count)
            with self.assertRaises(PipelineStop):
                collect(plan(35, FREE, engines=('broken', 'working'), count=4), folder, UA,
                        searchers=dict(broken=Broken(), working=Source()), client=client)

    def test_general_image_search_hits_never_enter_real_manifest_or_download(self):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            self.assertEqual(request.get_header('X-subscription-token'), 'PRIVATE_BRAVE_KEY')
            return response(dict(results=[dict(title='Unverified result', url='https://source.invalid/page',
                                              properties=dict(url='https://source.invalid/image.jpg'))]))

        search_plan = plan(34, FREE, engines=('brave',), count=4)
        with tempfile.TemporaryDirectory() as temp:
            client = SearchClient(UA, opener=opener, env=dict(BRAVE_IMAGE_SEARCH_KEY='PRIVATE_BRAVE_KEY'), delay=0)
            result = collect(search_plan, Path(temp), UA, searchers=dict(brave=BraveImageSearch()), client=client,
                             allow_paid_search=True, search_budget_usd=.02, brave_request_usd=.01)
            self.assertEqual(len(calls), 2)
            self.assertEqual(result['reserved_search_usd'], .02)
            self.assertEqual(result['candidates'], 0)
            self.assertEqual(result['hits'], 1)
            self.assertEqual(json.loads((Path(temp) / 'manifest.json').read_text()), [])
            self.assertNotIn('PRIVATE_BRAVE_KEY', (Path(temp) / 'queries.json').read_text())
            count = len(calls)
            collect(search_plan, Path(temp), UA, searchers=dict(brave=BraveImageSearch()), client=client,
                    allow_paid_search=True, search_budget_usd=.02, brave_request_usd=.01)
            self.assertEqual(len(calls), count)

    def test_partial_source_results_survive_error_and_no_retry_is_implicit(self):
        class Source:
            def search(self, client, query, limit):
                yield candidate('fixture', 'one', 'Photograph', 'https://source.invalid/one', 'https://source.invalid/one.jpg',
                                'Fixture', 'https://creativecommons.org/publicdomain/zero/1.0/', '{}')
                raise HTTPError('https://source.invalid', 500, 'failed', {}, None)

        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            result = collect(plan(34, FREE, engines=('partial',), count=4), folder, UA,
                             searchers=dict(partial=Source()), client=SearchClient(UA, env={}, delay=0))
            self.assertEqual(result['candidates'], 1)
            logs = json.loads((folder / 'queries.json').read_text())['queries']
            self.assertEqual(logs[0]['status'], 'partial')
            self.assertEqual(logs[0]['returned'], 1)
            self.assertEqual(logs[0]['new_candidates'], 1)
            self.assertTrue(all(r['status'] == 'skipped' for r in logs[1:]))

    def test_http_call_limit_is_durable_and_paid_search_is_disabled_by_default(self):
        calls = []

        class Source:
            def search(self, client, query, limit):
                client.get('https://api.openverse.org/v1/images/?q=fixture')
                return iter(())

        def opener(request, timeout):
            calls.append(request)
            return response({})

        with tempfile.TemporaryDirectory() as temp:
            result = collect(plan(34, FREE, engines=('working',), count=4), Path(temp), UA, max_api_calls=1,
                             searchers=dict(working=Source()), client=SearchClient(UA, max_calls=1, env={}, opener=opener, delay=0))
            self.assertEqual(result['used_api_calls'], 1)
            self.assertEqual(len(calls), 1)
        with tempfile.TemporaryDirectory() as temp:
            result = collect(plan(34, FREE, engines=('brave',), count=4), Path(temp), UA,
                             client=SearchClient(UA, opener=opener, env={}, delay=0))
            self.assertEqual(result['used_api_calls'], 0)
            self.assertEqual(result['reserved_search_usd'], 0)


if __name__ == '__main__':
    unittest.main()
