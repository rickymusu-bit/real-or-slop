import contextlib
from datetime import date
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from pipeline import automatic
from pipeline.providers import Client


class AutomaticPipelineTest(unittest.TestCase):
    day = date(2026, 11, 1)

    def batch(self, folder, count=2):
        rows = []
        for index in range(count):
            original = folder / f'{index}.png'
            Image.new('RGB', (4, 3), (index, 32, 64)).save(original)
            rows.append(dict(file=str(original), sha256=hashlib.sha256(original.read_bytes()).hexdigest(),
                             metadata=dict(type='REAL', title='Private fixture', author='Fixture',
                                           provider='fixture', source_id=str(index), source_url='https://example.invalid/' + str(index),
                                           evidence='Test only', explanation='Review required', categories=['arte'],
                                           rights='https://creativecommons.org/publicdomain/zero/1.0/')))
        (folder / 'manifest.json').write_text(json.dumps(rows))

    def test_default_is_a_network_free_plan_even_with_credentials(self):
        with patch('pipeline.automatic.collect') as collect, patch('pipeline.automatic.apply') as apply, \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(automatic.main([]), 0)
        collect.assert_not_called()
        apply.assert_not_called()

    def test_project_contact_and_bounded_repeatable_topic_rotation(self):
        Client('RealOrSlop/0.10 (+' + automatic.SITE + '/)')
        with self.assertRaises(ValueError):
            Client('anonymous bot')
        first = automatic.plan(self.day)
        self.assertEqual(first, automatic.plan(self.day))
        self.assertLess(first['offset'], 1000)
        topics = {automatic.plan(date(2026, 11, n))['query'] for n in range(1, 6)}
        self.assertEqual(len(topics), 5)

    def test_collect_downloads_originals_without_admin_calls_and_skips_ambiguous(self):
        data = io.BytesIO()
        Image.new('RGB', (5, 4), (32, 64, 96)).save(data, format='PNG')
        raw = data.getvalue()
        base = dict(provider='commons', title='File:Test', source_url='https://commons.wikimedia.org/wiki/File:Test',
                    image_url='https://upload.wikimedia.org/test.png', author='<a href="/user">Author &amp; team</a>',
                    evidence=json.dumps({'ImageDescription': {'value': '<p>Source caption</p>'}}),
                    rights='https://creativecommons.org/publicdomain/zero/1.0/')
        rows = [{**base, 'source_id': 'bad', 'rights': 'unknown'}, {**base, 'source_id': 'one'},
                {**base, 'source_id': 'duplicate'}]
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(automatic.PROVIDERS['commons'], 'search', return_value=iter(rows)), \
             patch('pipeline.run.download', return_value=(raw, hashlib.sha256(raw).hexdigest(), '0' * 16)), \
             patch('pipeline.automatic.request') as request, contextlib.redirect_stdout(io.StringIO()):
            manifest = automatic.collect(Path(tmp), self.day)
            items = json.loads(manifest.read_text())
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]['metadata']['author'], 'Author & team')
            self.assertEqual(items[0]['metadata']['status'], 'in-review')
            self.assertIn('Source caption', items[0]['metadata']['explanation'])
            self.assertEqual(Path(items[0]['file']).read_bytes(), raw)
            request.assert_not_called()

    def test_missing_secret_or_invalid_batch_cannot_make_remote_requests(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=True), \
             patch('pipeline.automatic.request') as request:
            with self.assertRaisesRegex(ValueError, 'REAL_OR_SLOP_ADMIN_TOKEN'):
                automatic.apply(Path(tmp), self.day)
            request.assert_not_called()
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'REAL_OR_SLOP_ADMIN_TOKEN': 'x' * 36}), \
             patch('pipeline.automatic.request') as request, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, 'Anteprima'):
                automatic.apply(Path(tmp), self.day)
            request.assert_not_called()

    def run_apply(self, folder, pending, approved=(), rejected=(), demo=True):
        calls = []

        def api(base, token, path, method='GET', data=None, headers=None):
            self.assertEqual(base, automatic.SITE)
            calls.append((path, method, data))
            if path == '/api/health':
                return {'demo': demo}
            if path.startswith('/api/admin/images?'):
                return {'in-review': pending, 'approved': list(approved), 'rejected': list(rejected)}[path.split('=')[1]]
            if path == '/api/admin/import':
                if method == 'GET':
                    return dict(direct_import=1, original_archive=True, quarantine_configured=True)
                return {'id': 'candidate-' + data['source_id'], 'status': 'in-review'}
            if method == 'PUT':
                return {'uploaded': True}
            self.fail('Unexpected API call: ' + path)

        with patch.dict(os.environ, {'REAL_OR_SLOP_ADMIN_TOKEN': 'x' * 36}), \
             patch('pipeline.automatic.request', side_effect=api), \
             patch('pipeline.importer.request', side_effect=api), contextlib.redirect_stdout(io.StringIO()):
            result = automatic.apply(folder, self.day)
        return result, calls

    def test_full_flow_imports_only_into_review_and_preserves_originals(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.batch(folder)
            result, calls = self.run_apply(folder, [])
            self.assertEqual(result, 0)
            posts = [data for path, method, data in calls if method == 'POST']
            self.assertEqual(len(posts), 2)
            self.assertFalse(any('/review/' in path or 'cloudflare' in path for path, _, _ in calls))
            self.assertEqual(sum('/originals/' in path for path, _, _ in calls), 2)
            self.assertEqual(sum('/assets/' in path for path, _, _ in calls), 2)
            receipt = json.loads((folder / 'import-receipt.json').read_text())
            self.assertTrue(all(row['status'] == 'in-review' for row in receipt['items']))

    def test_daily_budget_counts_approved_and_rejected_too(self):
        today = {'created_at': '2026-11-01 06:00:00', 'demo': 0}
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.batch(folder)
            result, calls = self.run_apply(folder, [today] * 3, approved=[today] * 3, rejected=[today] * 3)
            self.assertEqual(result, 0)
            self.assertEqual(sum(method == 'POST' for _, method, _ in calls), 1)

    def test_full_backlog_or_exhausted_daily_budget_prevents_all_writes(self):
        for pending in ([{'created_at': '2026-10-01'}] * 50, [{'created_at': '2026-11-01'}] * 10):
            with self.subTest(count=len(pending)), tempfile.TemporaryDirectory() as tmp:
                folder = Path(tmp)
                self.batch(folder)
                result, calls = self.run_apply(folder, pending)
                self.assertEqual(result, 0)
                self.assertTrue(all(method == 'GET' for _, method, _ in calls))

    def test_nearly_full_queue_admits_only_the_remaining_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.batch(folder)
            result, calls = self.run_apply(folder, [{'created_at': '2026-10-01'}] * 49)
            self.assertEqual(result, 0)
            self.assertEqual(sum(method == 'POST' for _, method, _ in calls), 1)

    def test_production_mode_is_refused_before_any_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.batch(folder)
            with self.assertRaisesRegex(ValueError, 'modalità demo'):
                self.run_apply(folder, [], demo=False)
