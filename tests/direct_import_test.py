import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
from pipeline.importer import main, prepare, request, site_url


class DirectImportTest(unittest.TestCase):
    def batch(self, root):
        original = root / 'photo.png'
        Image.new('RGB', (4, 3), (16, 32, 64)).save(original)
        sha = hashlib.sha256(original.read_bytes()).hexdigest()
        metadata = dict(type='REAL', title='Fixture', author='Test', provider='fixture', source_id='one',
                        source_url='https://example.invalid/source', evidence='Fixture only', categories=['arte'],
                        rights='https://creativecommons.org/licenses/by-nc-nd/3.0/de/',
                        explanation='Private fixture', difficulty='medio')
        item = dict(metadata=metadata, file=str(original), sha256=sha,
                    drive_archive={'file_id': 'obsolete'}, drive_original_url='https://drive.google.com/obsolete')
        manifest = root / 'manifest.json'
        manifest.write_text(json.dumps([item]))
        return manifest, item

    def test_preview_uses_local_files_and_never_calls_network_or_drive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest, item = self.batch(root)
            payload, data, mime, phash, original_sha, original = prepare(item, root)
            self.assertEqual(payload['license_name'], 'CC BY-NC-ND 3.0 DE')
            self.assertEqual(payload['file_sha256'], hashlib.sha256(data).hexdigest())
            self.assertEqual(original_sha, item['sha256'])
            self.assertEqual(mime, 'image/png')
            self.assertEqual(len(phash), 16)
            self.assertEqual(original.read_bytes(), data)
            self.assertFalse(any('drive' in key for key in payload))
            with patch('pipeline.importer.request') as request, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(manifest), '--base', 'https://example.invalid']), 0)
                request.assert_not_called()

    def test_source_changes_and_files_outside_batch_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            _, item = self.batch(root)
            with self.assertRaisesRegex(ValueError, 'Originale modificato'):
                prepare({**item, 'sha256': '0'*64}, root)
            with self.assertRaisesRegex(ValueError, 'cartella del manifest'):
                prepare({**item, 'file': str(Path(__file__).resolve())}, root)

    def test_apply_checks_worker_storage_before_any_writes(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest, _ = self.batch(Path(folder))
            with patch.dict('os.environ', {'REAL_OR_SLOP_ADMIN_TOKEN': 'x'*36}), \
                 patch('pipeline.importer.request', return_value={'direct_import': 1, 'original_archive': True, 'quarantine_configured': False}) as request, \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(manifest), '--base', 'https://example.invalid', '--apply']), 1)
                self.assertEqual(request.call_count, 1)
                self.assertEqual(request.call_args.args[2], '/api/admin/import')

    def test_destination_is_an_exact_origin_without_credentials(self):
        for url in ['https://user:secret@example.invalid', 'http://example.invalid', 'https://example.invalid/admin',
                    'https://example.invalid/?token=secret', 'https://example.invalid/#fragment']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                site_url(url)
        self.assertEqual(site_url('http://127.0.0.1:8788/'), 'http://127.0.0.1:8788')

    def test_transport_errors_cannot_print_credentials(self):
        secret = 'PRIVATE_TEST_TOKEN'
        with patch('pipeline.importer.build_opener', side_effect=ValueError('Invalid header: '+secret)):
            with self.assertRaises(ValueError) as error:
                request('https://example.invalid', secret, '/api/admin/import')
            self.assertNotIn(secret, str(error.exception))

    def test_requests_identify_the_importer_and_keep_credentials_in_headers(self):
        from unittest.mock import Mock
        opener = Mock()
        opener.open.return_value = io.BytesIO(b'{"ok": true}')
        with patch('pipeline.importer.build_opener', return_value=opener):
            self.assertEqual(request('https://example.invalid', 'test-secret', '/api/health'), {'ok': True})
        outgoing = opener.open.call_args.args[0]
        self.assertEqual(outgoing.get_header('User-agent'), 'RealOrSlop/0.10 (+https://example.invalid/)')
        self.assertEqual(outgoing.get_header('Authorization'), 'Bearer test-secret')
        self.assertNotIn('test-secret', outgoing.full_url)
