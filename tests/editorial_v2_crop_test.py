import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from pipeline.editorial import PipelineStop
from pipeline.v2.engine import media
from pipeline.v2.presentation import DEFAULT_CROP_MODEL, main as present, standard_copy
from pipeline.v2.smart_crop import crop_options, payload, run, validate_decision


class CropTest(unittest.TestCase):
    def inputs(self, root):
        rows = []
        for uid, size in [('wide', (1600, 1000)), ('square', (1024, 1024))]:
            stream = io.BytesIO()
            Image.new('RGB', size, 'blue').save(stream, 'PNG')
            rows.append(dict(id=uid, **media(stream.getvalue(), root, 'inputs', uid)))
        path = root / 'state.json'
        path.write_text(json.dumps(dict(candidates=rows)))
        return [path]

    def api(self, decision=None, status='completed'):
        calls = []

        def invoke(body):
            calls.append(body)
            choice = decision or dict(crop_id='c4', preserves_context=True, needs_review=False, reason='Conserva gli elementi a destra.')
            return dict(status=status, model='fixture-vision', usage=dict(input_tokens=10, output_tokens=10),
                        output=[dict(content=[dict(type='output_text', text=json.dumps(choice))])]), 'req-fixture'
        return calls, invoke

    def test_options_cover_long_axis_with_maximum_squares_and_center(self):
        for width, height in ((1600, 1000), (1000, 1600), (1001, 1000), (1000, 1000)):
            rows = crop_options(width, height)
            self.assertEqual(sum(row['center'] for row in rows), 1)
            self.assertLessEqual(len(rows), 5)
            for row in rows:
                x0, y0, x1, y1 = row['box']
                self.assertTrue(0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height)
                self.assertEqual(x1 - x0, y1 - y0)
                self.assertEqual(x1 - x0, min(width, height))

    def test_visual_request_contains_only_pixels_and_local_choices(self):
        frame = Image.new('RGB', (1600, 1000), 'blue')
        body = payload(frame, crop_options(*frame.size), 'fixture-vision', 'frozen-seed')
        self.assertEqual(body, payload(frame, crop_options(*frame.size), 'fixture-vision', 'frozen-seed'))
        self.assertFalse(body['store'])
        self.assertNotIn('tools', body)
        self.assertEqual(body['text']['format']['type'], 'json_schema')
        parts = body['input'][0]['content']
        self.assertIn('1600×1000', parts[0]['text'])
        self.assertIn('1.0240×', parts[0]['text'])
        self.assertEqual(sum(p['type'] == 'input_image' for p in parts), 6)
        for part in parts:
            if part['type'] == 'input_image':
                self.assertTrue(part['image_url'].startswith('data:image/webp;base64,'))
        self.assertNotIn('provenance', json.dumps(body))

    def test_presentation_defaults_to_terra_and_plans_without_paid_calls(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            states = self.inputs(root)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                present(['--states', str(states[0]), '--out', str(root / 'review'),
                         '--budget-usd', '0.1', '--reservation-usd', '0.018'])
            plan = json.loads(output.getvalue())
            self.assertEqual(plan['model'], DEFAULT_CROP_MODEL)
            self.assertEqual(plan['required_calls'], 1)
            self.assertFalse(plan['paid'])
            self.assertFalse((root / 'review').exists())

    def test_validate_decision_rejects_unknown_options_and_incoherent_abstention(self):
        base = dict(crop_id='c1', preserves_context=True, needs_review=False, reason='Contesto conservato.')
        options = crop_options(1600, 1000)
        for changes in (dict(crop_id='outside'), dict(crop_id=None), dict(preserves_context=False), dict(reason=''), dict(needs_review=1)):
            with self.subTest(changes=changes), self.assertRaises(PipelineStop):
                validate_decision(base | changes, options)

    def test_offline_plan_budget_and_resume_skip_paid_calls_for_square_images(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            root = Path(folder)
            states = self.inputs(root)
            out = root / 'study'
            calls, api = self.api()
            plan = run(states, out, 'fixture-vision', .1, .018, 1, api=api)
            self.assertEqual(plan['required_calls'], 1)
            self.assertFalse(out.exists())
            self.assertFalse(calls)
            with self.assertRaises(PipelineStop):
                run(states, out, 'fixture-vision', .01, .018, 1, True, api)
            report = run(states, out, 'fixture-vision', .1, .018, 1, True, api)
            self.assertEqual(len(calls), 1)
            self.assertEqual(report['different_from_center'], 1)
            self.assertEqual(report['skipped_square'], 1)
            self.assertEqual(report['human_reviews'], 0)
            self.assertFalse(report['superiority_measured'])
            self.assertEqual(report, run(states, out, 'fixture-vision', .1, .018, 1, True, api))
            self.assertEqual(len(calls), 1)
            state = json.loads((out / 'state.json').read_text())
            self.assertEqual(state['items'][0]['presentation']['crop_box'], [600, 0, 1600, 1000])
            self.assertIsNone(state['items'][0]['presentation']['profile'])
            with self.assertRaises(PipelineStop):
                run(states, out, 'different-model', .1, .018, 1, True, api)
            (out / 'media/wide.webp').write_bytes(b'changed')
            with self.assertRaises(PipelineStop):
                run(states, out, 'fixture-vision', .1, .018, 1, True, api)
            self.assertEqual(len(calls), 1)

    def test_abstention_keeps_center_with_explicit_review_flag(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            root = Path(folder)
            _, api = self.api(dict(crop_id=None, preserves_context=False, needs_review=True, reason='Tutte le opzioni perdono contesto.'))
            report = run(self.inputs(root), root / 'study', 'fixture-vision', .1, .018, 1, True, api)
            self.assertEqual(report['abstentions'], 1)
            self.assertEqual(report['model_review_flags'], 1)
            self.assertEqual(report['different_from_center'], 0)

    def test_incomplete_response_or_uncertain_submission_is_never_retried(self):
        for kind in ('incomplete', 'lost_acknowledgement'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
                root = Path(folder)
                states = self.inputs(root)
                calls, normal = self.api(status='incomplete')

                def api(body):
                    if kind == 'lost_acknowledgement':
                        calls.append(body)
                        raise OSError('Connection lost after submission')
                    return normal(body)

                for _ in range(2):
                    with self.assertRaises(PipelineStop):
                        run(states, root / 'study', 'fixture-vision', .1, .018, 1, True, api)
                self.assertEqual(len(calls), 1)
                state = json.loads((root / 'study/state.json').read_text())
                self.assertEqual(state['reserved_usd'], .018)
                self.assertEqual(state['items'][0]['status'], 'error')

    def test_selected_crop_must_be_in_bounds_and_use_maximum_area(self):
        with tempfile.TemporaryDirectory() as folder:
            stream = io.BytesIO()
            Image.new('RGB', (1600, 1000), 'blue').save(stream, 'PNG')
            for box in ((-1, 0, 999, 1000), (0, 0, 999, 999), (0, 0, 1000, 900), (0.0, 0, 1000, 1000)):
                with self.subTest(box=box), self.assertRaises(PipelineStop):
                    standard_copy(stream.getvalue(), Path(folder) / 'output.webp', crop_box=box)


if __name__ == '__main__':
    unittest.main()
