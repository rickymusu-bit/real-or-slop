import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from pipeline.editorial import AXES, PipelineStop
from pipeline.import_comparison import extract_verified


class ComparisonImportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def bundle(self, *, outside=False, corrupt=False, invalid_decision=False):
        path = self.root / 'bundle.zip'
        media, ranked = [], []
        with zipfile.ZipFile(path, 'w') as archive:
            def put(uid, kind, group):
                data = ('fixture-' + uid + '-' + kind).encode()
                name = group + '/' + uid + '/' + kind + '.png'
                digest = hashlib.sha256(data).hexdigest()
                archive.writestr(name, b'changed' if corrupt and not media else data)
                media.append(dict(id=uid, kind=kind, file=name, sha256=digest))
                return digest
            def assessment(score):
                return dict(scores={key: score for key in AXES}, score=score, reason='Fixture osservabile', concrete_motive='Fixture', photographic=True)
            for index in range(20):
                uid = f'ref-{index}'
                ranked.append(dict(id=uid, rank=index + 1, role='REAL' if index < 10 else 'SLOP', evaluation=assessment(60 - index), metadata={}, original_sha256=put(uid, 'original', 'sources'), file_sha256=put(uid, 'preview', 'sources')))
            for index in range(10):
                uid = f'attempt-{index}'
                record = dict(id=uid, reference_id=f'ref-{index + 10}', status='accepted' if invalid_decision else 'discarded', editorial_threshold=65, evaluation=assessment(50), original_sha256=put(uid, 'original', 'generations'), sha256=put(uid, 'preview', 'generations'))
                archive.writestr(f'evaluation/attempts/{uid}.json', json.dumps(record))
            archive.writestr('evaluation/ranking.json', json.dumps(ranked))
            archive.writestr('media-manifest.json', json.dumps(media))
            if outside:
                archive.writestr('../outside.txt', 'forbidden')
        return path, hashlib.sha256(path.read_bytes()).hexdigest()

    def test_frozen_roles_and_private_paths_survive_extraction(self):
        path, digest = self.bundle()
        ranked, attempts, files = extract_verified(path, digest, self.root / 'out')
        self.assertEqual([p['role'] for p in ranked], ['REAL'] * 10 + ['SLOP'] * 10)
        self.assertEqual(len(attempts), 10)
        self.assertEqual(len(files), 60)
        self.assertEqual(attempts[0]['file'], 'generations/attempt-0/original.png')

    def test_wrong_bundle_digest_stops_before_extraction(self):
        path, _ = self.bundle()
        with self.assertRaises(PipelineStop):
            extract_verified(path, '0' * 64, self.root / 'out')
        self.assertFalse((self.root / 'out').exists())

    def test_zip_traversal_is_rejected(self):
        path, digest = self.bundle(outside=True)
        with self.assertRaises(PipelineStop):
            extract_verified(path, digest, self.root / 'out')
        self.assertFalse((self.root / 'outside.txt').exists())

    def test_file_corruption_is_rejected(self):
        path, digest = self.bundle(corrupt=True)
        with self.assertRaises(PipelineStop):
            extract_verified(path, digest, self.root / 'out')

    def test_below_threshold_output_cannot_become_accepted(self):
        path, digest = self.bundle(invalid_decision=True)
        with self.assertRaises(PipelineStop):
            extract_verified(path, digest, self.root / 'out')


if __name__ == '__main__':
    unittest.main()
