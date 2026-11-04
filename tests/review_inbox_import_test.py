import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image
spec=importlib.util.spec_from_file_location('inbox_sync',Path('scripts/sync-review-inbox.py'))
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)

class ReviewInboxImportTest(unittest.TestCase):
    def fixture(self,root):
        path=root/'photo.png';Image.new('RGB',(20,10),(40,70,120)).save(path)
        return dict(version='1.0.0',images=[dict(id='test-image',origin='REAL',sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            file=str(path),original_file=str(path),metadata=dict(previous_decision='rejected'),pair_key=None,created_at='2026-11-04')])
    def test_pending_import_preserves_pixels_and_previous_refusal_without_needing_a_partner(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);plan=self.fixture(root);before=(root/'photo.png').read_bytes()
            rows,files=sync.prepare(plan,root)
            self.assertEqual(len(rows),1);self.assertEqual(len(files),1)
            self.assertEqual((root/'photo.png').read_bytes(),before)
            self.assertIsNone(rows[0][5]);self.assertIn('rejected',rows[0][4])
    def test_wrong_hash_and_duplicates_are_rejected_before_any_upload(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);plan=self.fixture(root);plan['images'][0]['sha256']='f'*64
            with self.assertRaises(ValueError):sync.prepare(plan,root)
            plan=self.fixture(root);plan['images'].append(copy.deepcopy(plan['images'][0]))
            with self.assertRaises(ValueError):sync.prepare(plan,root)
    def test_import_cannot_approve_images_or_read_outside_workspace(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);plan=self.fixture(root);plan['images'][0]['status']='approved'
            with self.assertRaises(ValueError):sync.prepare(plan,root)
            plan=self.fixture(root)
            with self.assertRaises(ValueError):sync.prepare(plan,root/'other')
