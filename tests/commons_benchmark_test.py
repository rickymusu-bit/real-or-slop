import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from pipeline.editorial import PipelineStop
from pipeline.real.commons_benchmark import run, public_report
from pipeline.real.fixtures import search_client
from pipeline.real.openverse_check import check
from pipeline.real.providers import retrieve
from pipeline.v2.search_sources import SearchClient


class CommonsBenchmarkTest(unittest.TestCase):
    def test_live_runner_replays_cached_pairs_and_never_invents_approvals(self):
        workload = json.loads(Path('data/editorial/commons-benchmark.v1.1.0.json').read_text())
        workload['cells'] = workload['cells'][:1]
        network_calls = []
        def source(*args, **kwargs):
            client = search_client(kwargs['max_calls'])
            opener = client.opener
            def tracked(request, timeout):
                network_calls.append(request.full_url)
                return opener(request, timeout)
            client.opener = tracked
            return retrieve(*args, **kwargs, client=client)
        with tempfile.TemporaryDirectory() as folder, patch('pipeline.real.commons_benchmark.retrieve', source), contextlib.redirect_stdout(io.StringIO()):
            result = run(workload, folder)
            self.assertEqual(result['summary']['general']['api_calls'], 2)
            self.assertEqual(result['summary']['adapted']['api_calls'], 2)
            self.assertIsNone(result['summary']['adapted']['human_approved'])
            self.assertFalse(result['paid_calls'])
            published = public_report(result)
            self.assertNotIn('fixture.invalid', json.dumps(published))
            self.assertIn('fixture.invalid', json.dumps(result))
            self.assertEqual(published['summary'], result['summary'])
            again = run(workload, folder)
            self.assertEqual(again, result)
            self.assertEqual(len(network_calls), 4)
            for pair in result['pairs']:
                self.assertTrue(pair['general']['compiled_query'].endswith('filetype:bitmap'))
                self.assertTrue(pair['adapted']['compiled_query'].endswith('filetype:bitmap'))

    def test_invalid_later_query_is_rejected_before_any_request(self):
        workload = json.loads(Path('data/editorial/commons-benchmark.v1.1.0.json').read_text())
        workload['cells'][-1]['queries'][-1]['adapted'] = 'https://arbitrary.invalid'
        with tempfile.TemporaryDirectory() as folder, patch('pipeline.real.commons_benchmark.retrieve', side_effect=AssertionError('HTTP emitted')):
            with self.assertRaises(PipelineStop):
                run(workload, folder)

    def test_openverse_reports_cloudflare_challenge_without_response_or_secrets(self):
        def opener(request, timeout):
            raise HTTPError(request.full_url, 403, 'blocked', {'Content-Type': 'text/html', 'cf-ray': 'fixture-ray'},
                            io.BytesIO(b'Just a moment... challenges.cloudflare.com PRIVATE_TOKEN'))
        client = SearchClient('Test (https://github.com/rickymusu-bit/real-or-slop)', env={}, opener=opener, sleep=lambda _: None)
        result = check(client, {})
        self.assertEqual(result['status'], 'provider_challenge')
        self.assertEqual(result['cloudflare_ray'], 'fixture-ray')
        self.assertEqual(result['api_calls'], 1)
        self.assertNotIn('PRIVATE_TOKEN', json.dumps(result))
        self.assertFalse(result['error_body_retained'])

    def test_benchmark_stops_after_provider_denial(self):
        workload = json.loads(Path('data/editorial/commons-benchmark.v1.1.0.json').read_text())
        requests = []
        def opener(request, timeout):
            requests.append(request.full_url)
            raise HTTPError(request.full_url, 403, 'blocked', {}, io.BytesIO(b'blocked'))
        def source(*args, **kwargs):
            client = SearchClient('Test (https://github.com/rickymusu-bit/real-or-slop)', env={}, opener=opener, sleep=lambda _: None)
            return retrieve(*args, **kwargs, client=client)
        with tempfile.TemporaryDirectory() as folder, patch('pipeline.real.commons_benchmark.retrieve', source):
            with self.assertRaises(PipelineStop):
                run(workload, folder)
            self.assertEqual(len(requests), 1)

    def test_openverse_uses_configured_token_without_exposing_it(self):
        calls = []
        def opener(request, timeout):
            calls.append(request)
            self.assertEqual(request.get_header('Authorization'), 'Bearer PRIVATE_TOKEN')
            return io.BytesIO(b'{"results":[]}')
        env = {'OPENVERSE_ACCESS_TOKEN': 'PRIVATE_TOKEN'}
        client = SearchClient('Test (https://github.com/rickymusu-bit/real-or-slop)', env=env, opener=opener, sleep=lambda _: None)
        result = check(client, env)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['auth_mode'], 'access_token')
        self.assertNotIn('PRIVATE_TOKEN', json.dumps(result))
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
