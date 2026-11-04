import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import hashlib
from PIL import Image

from pipeline.editorial import PipelineStop
from pipeline.v2.study import Preparation, acquire_sources


class PreparationFixture:
    def __init__(self):
        self.calls = []

    def request(self, endpoint, body):
        self.calls.append((endpoint, body))
        instruction = body['instructions']
        if '\nID: ' in instruction:
            ids = json.loads(instruction.split('\nID: ')[1].split('\n')[0])
            value = dict(version='2.0.0', independent=True,
                         ideas=[dict(id=uid, mode='original', idea='Idea autonoma', prompt='An ordinary photographic scene with people.') for uid in ids])
        else:
            value = dict(queries=['independent search ' + str(i) for i in range(8)])
        return dict(status='completed', output=[dict(content=[dict(type='output_text', text=json.dumps(value))])]), 'req-preparation-fixture'


class PreparationTest(unittest.TestCase):
    def test_ideas_and_queries_are_frozen_before_sources_with_no_repeat_calls(self):
        with tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
            root = Path(temp)
            api = PreparationFixture()
            prep = Preparation(root, api)
            prep.freeze(4)
            frozen = json.loads((root / 'inputs-frozen.json').read_text())
            self.assertTrue(frozen['independent'])
            self.assertEqual(len(api.calls), 2)
            self.assertEqual(prep.state['reserved_usd'], .04)
            for endpoint, body in api.calls:
                self.assertEqual(endpoint, 'responses')
                self.assertNotIn('input_image', json.dumps(body))
                self.assertFalse(body['store'])
            Preparation(root, api).freeze(4)
            self.assertEqual(len(api.calls), 2)
            with self.assertRaises(PipelineStop):
                prep.freeze(100)
            (root / 'slop-plan.json').write_text('{}')
            with self.assertRaises(PipelineStop):
                prep.freeze(4)

    def test_preparation_never_resubmits_an_uncertain_request(self):
        class Lost(PreparationFixture):
            def request(self, endpoint, body):
                self.calls.append((endpoint, body))
                raise OSError('Lost acknowledgement')
        with tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
            root = Path(temp)
            api = Lost()
            with self.assertRaises(OSError):
                Preparation(root, api).freeze(4)
            with self.assertRaises(PipelineStop):
                Preparation(root, api).freeze(4)
            self.assertEqual(len(api.calls), 1)
            self.assertEqual(json.loads((root / 'preparation.json').read_text())['reserved_usd'], .02)

    def test_budget_is_reserved_before_network_and_never_exceeded(self):
        with tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
            api = PreparationFixture()
            root = Path(temp)
            with self.assertRaises(PipelineStop):
                Preparation(root, api, cap=.01).freeze(4)
            self.assertEqual(api.calls, [])

    def test_acquisition_keeps_low_resolution_original_for_terra_instead_of_excluding_it(self):
        with tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
            root = Path(temp)
            Preparation(root, PreparationFixture()).freeze(4)
            stream = io.BytesIO()
            Image.new('RGB', (640, 480), 'blue').save(stream, 'PNG')
            raw = stream.getvalue(); checksum = hashlib.sha256(raw).hexdigest()
            meta = dict(provider='commons', source_id='fixture', title='Fixture photograph',
                        source_url='https://commons.wikimedia.org/wiki/File:fixture.png',
                        image_url='https://upload.wikimedia.org/fixture.png', author='Fixture author',
                        rights='https://creativecommons.org/licenses/by/4.0/')
            def collected(plan, directory, *args, **kwargs):
                directory.mkdir(parents=True)
                (directory/'manifest.json').write_text(json.dumps([dict(metadata=meta)]))
                (directory/'queries.json').write_text(json.dumps(dict(used_api_calls=0)))
                return dict(status='completed')
            with patch('pipeline.v2.study.collect', side_effect=collected), \
                 patch('pipeline.v2.study.download', return_value=(raw, checksum, '0'*16)) as downloaded:
                result = acquire_sources(root, target=1)
            self.assertEqual(result['real_candidates'], 1)
            self.assertEqual(downloaded.call_count, 1)
            manifest = json.loads((root/'real-manifest.json').read_text())
            self.assertEqual((root/manifest[0]['file']).read_bytes(), raw)
            self.assertEqual(manifest[0]['provenance']['authenticity'], 'unverified')


if __name__ == '__main__':
    unittest.main()
