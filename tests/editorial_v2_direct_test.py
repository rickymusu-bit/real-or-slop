import base64
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError

from PIL import Image

from pipeline.editorial import PipelineStop
from pipeline.v2.direct import DirectAPI, DirectEngine, DirectHTTPError
from pipeline.v2.engine import Config, initialize
from pipeline.v2.benchmark import report
from pipeline.v2.fixtures import study_inputs, picture, profile


class FixtureDirect:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def request(self, endpoint, body):
        self.calls.append((endpoint, body))
        if self.fail:
            raise OSError('Lost acknowledgement')
        if endpoint == 'images/generations':
            return dict(created=1793750400, data=[dict(b64_json=base64.b64encode(picture(7, (1024, 1024))).decode())]), 'req-generation'
        if body['text']['format']['name'] == 'crop_choice':
            ids = body['text']['format']['schema']['properties']['crop_id']['enum']
            value = dict(crop_id=next(x for x in ids if x is not None), preserves_context=True, needs_review=False, reason='Fixture crop')
        else:
            value = profile(7)
        return dict(status='completed', model='fixture', usage=dict(input_tokens=1, output_tokens=1),
                    output=[dict(content=[dict(type='output_text', text=json.dumps(value))])]), 'req-vision'


class DirectV2Test(unittest.TestCase):
    def test_full_frame_real_never_calls_crop_and_profile_binds_uncropped_pixels(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            engine = self.engine(Path(tmp), 'REAL', presentation_mode='whole_frame', size='auto')
            engine.run(True)
            self.assertEqual([j['stage'] for j in engine.state['jobs']], ['profile', 'profile'])
            for r in engine.state['candidates']:
                self.assertEqual((r['width'], r['height']), (64, 48))
                self.assertTrue(r['presentation']['whole_frame'])
                self.assertEqual(r['presentation']['retained_area'], 1)
                self.assertEqual(r['profile_image_sha256'], r['sha256'])
            calls = len(engine.api.calls)
            engine.run(True)
            self.assertEqual(len(engine.api.calls), calls)

    def test_auto_generation_preserves_model_selected_portrait_and_receipt_parameters(self):
        class PortraitAPI(FixtureDirect):
            def request(self, endpoint, body):
                if endpoint == 'images/generations':
                    self.calls.append((endpoint, body))
                    return dict(created=1793750400, data=[dict(b64_json=base64.b64encode(picture(7, (80, 120))).decode())]), 'req-portrait'
                return super().request(endpoint, body)
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            engine = self.engine(Path(tmp), 'AI', PortraitAPI(), presentation_mode='whole_frame', size='auto')
            engine.run(True)
            self.assertFalse(any(j['stage'] == 'crop' for j in engine.state['jobs']))
            for endpoint, body in engine.api.calls:
                if endpoint == 'images/generations':
                    self.assertEqual(body['size'], 'auto')
                    self.assertEqual(set(body), {'model', 'prompt', 'n', 'size', 'quality'})
            for r in engine.state['candidates']:
                self.assertEqual((r['width'], r['height']), (80, 120))
                self.assertEqual(r['provenance']['parameters']['size'], 'auto')
                self.assertEqual(r['profile_image_sha256'], r['sha256'])

    def engine(self, root, origin, api=None, presentation_mode='square_crop', size='1024x1024'):
        real, slop = study_inputs(root / 'inputs', 4)
        cfg = Config(evaluator_model='fixture', image_model='fixture', run_usd=10, daily_usd=10,
                     evaluation_usd=.02, generation_usd=.075, max_output_tokens=3000, reasoning_effort='none',
                     presentation_mode=presentation_mode, size=size)
        folder = root / 'run'
        state = initialize(origin, real if origin == 'REAL' else slop, root / 'inputs', folder, cfg,
                           'direct-' + origin, True, dict(author='Fixture', url=None))
        state['transport'] = 'synchronous'
        return DirectEngine(state, folder, api or FixtureDirect(), concurrency=1)

    def test_generation_crop_profile_are_direct_and_profiles_use_final_square_pixels(self):
        for origin in ('REAL', 'AI'):
            with self.subTest(origin=origin), tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
                engine = self.engine(Path(temp), origin)
                result = engine.run(True)
                self.assertEqual(result['status'], 'completed')
                self.assertEqual(result['candidates'], 2)
                resize = report(engine.state['candidates'])['technical'][origin]['resize']
                self.assertEqual(resize['measured'], 2)
                self.assertEqual(resize['upscaled'], 2 if origin == 'REAL' else 0)
                self.assertEqual(resize['unmeasured'], 0)
                self.assertEqual({endpoint for endpoint, _ in engine.api.calls}, {'responses', 'images/generations'} if origin == 'AI' else {'responses'})
                for row in engine.state['candidates']:
                    self.assertEqual(row['profile_image_sha256'], row['sha256'])
                    self.assertEqual((row['width'], row['height']), (1024, 1024))
                    self.assertEqual(row['review_state'], 'quarantine')
                    self.assertEqual(row['presentation']['review_status'], 'pending')
                for endpoint, body in engine.api.calls:
                    self.assertNotIn('background', body)
                    self.assertNotIn('tools', body)
                    if endpoint == 'images/generations':
                        self.assertEqual(set(body), {'model', 'prompt', 'n', 'size', 'quality'})
                    elif body['text']['format']['name'] == 'final_visual_profile':
                        raw = base64.b64decode(body['input'][0]['content'][1]['image_url'].split(',', 1)[1])
                        with Image.open(io.BytesIO(raw)) as image:
                            self.assertEqual(image.size, (1024, 1024))
                count = len(engine.api.calls)
                self.assertEqual(engine.run(True), result)
                self.assertEqual(len(engine.api.calls), count)
                if origin == 'AI':
                    self.assertTrue(all(j['stage'] != 'crop' for j in engine.state['jobs']))

    def test_real_spending_requires_server_ledger_and_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            engine = self.engine(Path(temp), 'AI')
            engine.state['simulated'] = False
            with self.assertRaises(PipelineStop):
                engine.run(True)
            self.assertEqual(engine.api.calls, [])

    def test_uncertain_paid_submission_never_retries_on_resume(self):
        with tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
            engine = self.engine(Path(temp), 'AI', FixtureDirect(fail=True))
            with self.assertRaises(PipelineStop):
                engine.run(True)
            restored = json.loads((engine.folder / 'state.json').read_text())
            again = DirectEngine(restored, engine.folder, engine.api, concurrency=1)
            with self.assertRaises(PipelineStop):
                again.run(True)
            self.assertEqual(len(engine.api.calls), 1)
            self.assertEqual(again.state['calls']['generation'], 1)
            self.assertEqual(again.state['reserved_usd'], .075)

    def test_receipt_recovery_has_no_new_paid_call(self):
        with tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
            engine = self.engine(Path(temp), 'AI')
            row = engine.state['attempts'][0]
            job = engine.job('generation', row)
            endpoint, body = engine.body(job)
            from pipeline.v2.direct import digest
            from pipeline.editorial import write_private
            job.update(status='submitting', payload_sha256=digest(json.dumps(body, sort_keys=True).encode()))
            response, request_id = engine.api.request(endpoint, body)
            write_private(engine.folder / 'receipts' / (job['id'] + '.json'),
                          dict(payload_sha256=job['payload_sha256'], request_id=request_id, response=response))
            engine.recover_receipts()
            self.assertEqual(row['status'], 'generated')
            self.assertEqual(job['status'], 'completed')
            self.assertEqual(len(engine.api.calls), 1)

    def test_provider_client_rejects_batch_endpoints_and_background_work(self):
        api = DirectAPI('fixture-key', opener=lambda *_: self.fail('No request should be sent'))
        for endpoint in ('files', 'batches', 'images/edits'):
            with self.assertRaises(PipelineStop):
                api.request(endpoint, {})
        with self.assertRaises(PipelineStop):
            api.request('responses', dict(store=False, background=True))

    def test_http_rejection_keeps_private_body_request_id_and_reservation_without_retry(self):
        def reject(request, timeout):
            raise HTTPError(request.full_url, 400, 'Bad Request', {'x-request-id': 'req-rejected'},
                            io.BytesIO(b'{"error":{"code":"invalid_request","message":"Rejected fixture"}}'))
        api = DirectAPI('fixture-key', opener=reject)
        with self.assertRaises(DirectHTTPError) as error:
            api.request('images/generations', {})
        self.assertEqual(error.exception.request_id, 'req-rejected')
        self.assertEqual(error.exception.response['error']['code'], 'invalid_request')
        with tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
            engine = self.engine(Path(temp), 'AI', api)
            with self.assertRaises(PipelineStop):
                engine.run(True)
            paths = list((engine.folder / 'error-receipts').glob('*.json'))
            self.assertEqual(len(paths), 1)
            receipt = json.loads(paths[0].read_text())
            self.assertEqual(receipt['request_id'], 'req-rejected')
            self.assertNotIn('fixture-key', paths[0].read_text())
            self.assertEqual(engine.state['jobs'][0]['http_status'], 400)
            self.assertEqual(engine.state['reserved_usd'], .075)
            with self.assertRaises(PipelineStop):
                engine.run(True)
            self.assertEqual(engine.state['calls']['generation'], 1)


if __name__ == '__main__':
    unittest.main()
