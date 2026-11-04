import copy
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from pipeline.batch_api import BatchAPI
from pipeline.batch_store import BatchRemote
from pipeline.editorial import PipelineStop
from pipeline.v2.engine import Config, Engine, initialize
from pipeline.v2.fixtures import FixtureBatch, study_inputs


class TransportV2Test(unittest.TestCase):
    def engine(self, root, origin):
        real, slop = study_inputs(root / 'inputs', 4)
        cfg = Config(evaluator_model='fixture', image_model='fixture', run_usd=10, daily_usd=10,
                     evaluation_usd=.01, generation_usd=.1)
        folder = root / 'run'
        state = initialize(origin, real if origin == 'REAL' else slop, root / 'inputs', folder, cfg,
                           'transport-' + origin, True, dict(author='Fixture', url=None))
        return Engine(state, folder, FixtureBatch())

    def test_paid_gate_is_rechecked_after_reservation_without_double_debit(self):
        for origin in ('REAL', 'AI'):
            for enabled in (False, True):
                with self.subTest(origin=origin, enabled=enabled), tempfile.TemporaryDirectory() as temp:
                    engine = self.engine(Path(temp), origin)
                    engine._setup()
                    job = engine.state['jobs'][0]
                    engine._reserve(job)
                    before = copy.deepcopy(engine.state['calls']), engine.state['reserved_usd']
                    engine.remote = Mock()
                    if not enabled:
                        engine.remote.reserve_batch.side_effect = PipelineStop('Paid gate closed')
                    result = engine.tick(execute=True)
                    engine.remote.reserve_batch.assert_called_once_with(job)
                    self.assertEqual((engine.state['calls'], engine.state['reserved_usd']), before)
                    self.assertEqual(len(engine.api.batches), int(enabled))
                    self.assertEqual(result['status'], 'active' if enabled else 'paused')

    def test_cancel_preserves_previous_error_as_history(self):
        with tempfile.TemporaryDirectory() as temp:
            engine = self.engine(Path(temp), 'REAL')
            engine.state.update(status='paused', error='Upload HTTP 401')
            result = engine.cancel()
            self.assertEqual(result['status'], 'cancelled')
            self.assertIsNone(result['error'])
            self.assertEqual(engine.state['error_before_cancellation'], 'Upload HTTP 401')
            self.assertEqual(engine.api.batches, {})

    def test_http_errors_show_status_without_response_body_or_credentials(self):
        def denied(request, timeout):
            raise HTTPError(request.full_url, 403, 'PRIVATE_TEST_KEY', {}, io.BytesIO(b'PRIVATE_TEST_KEY'))
        api = BatchAPI('PRIVATE_TEST_KEY', denied)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'request.jsonl'
            path.write_text('{}\n')
            with self.assertRaises(PipelineStop) as error:
                api.upload_jsonl(path)
            self.assertIn('HTTP 403', str(error.exception))
            self.assertNotIn('PRIVATE_TEST_KEY', str(error.exception))

    def test_checkpoint_download_uses_application_user_agent_and_integrity_check(self):
        raw = b'fixture-private-image'
        sha = hashlib.sha256(raw).hexdigest()

        class Remote(BatchRemote):
            def call(self, suffix):
                return dict(files=[dict(path='inputs/photo/original.png', sha256=sha, size=len(raw))], revision=2, state=dict(id='fixture'))

        def download(request, timeout):
            self.assertTrue(request.get_header('User-agent').startswith('RealOrSlop/'))
            self.assertEqual(request.get_header('Authorization'), 'Bearer ' + 'fixture-' * 5)
            return io.BytesIO(raw)

        with tempfile.TemporaryDirectory() as temp, patch('urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect = download
            remote = Remote('https://example.invalid', 'fixture-' * 5, 'fixture')
            self.assertEqual(remote.restore(Path(temp)), dict(id='fixture'))
            self.assertEqual((Path(temp) / 'inputs/photo/original.png').read_bytes(), raw)


if __name__ == '__main__':
    unittest.main()
