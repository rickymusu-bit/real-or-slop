import hashlib
import io
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from pipeline.editorial import PipelineStop
from pipeline.v2.presentation import standard_copy


class PresentationTest(unittest.TestCase):
    def test_different_aspects_share_canvas_and_keep_auditable_pending_crops(self):
        with tempfile.TemporaryDirectory() as folder:
            for width, height in ((1600, 900), (900, 1600), (1024, 1024)):
                stream = io.BytesIO()
                Image.new('RGB', (width, height), 'red').save(stream, 'PNG')
                raw = stream.getvalue()
                target = Path(folder) / f'{width}-{height}.webp'
                p = standard_copy(raw, target)
                with Image.open(target) as image:
                    self.assertEqual(image.size, (1024, 1024))
                    self.assertEqual(image.mode, 'RGB')
                    self.assertFalse(image.getexif())
                self.assertEqual(p['source_sha256'], hashlib.sha256(raw).hexdigest())
                self.assertEqual(p['review_status'], 'pending')
                self.assertIsNone(p['profile'])
                left, top, right, bottom = p['crop_box']
                self.assertEqual(right - left, bottom - top)
                self.assertEqual((left, top), ((width - min(width, height)) // 2, (height - min(width, height)) // 2))
                self.assertEqual(p['upscaled'], min(width, height) < 1024)
                with self.assertRaises(PipelineStop):
                    standard_copy(raw, target, (1200, 800))

    def test_orientation_is_applied_before_recording_crop_coordinates(self):
        stream = io.BytesIO()
        exif = Image.Exif()
        exif[274] = 6
        Image.new('RGB', (1800, 1200), 'blue').save(stream, 'JPEG', exif=exif)
        with tempfile.TemporaryDirectory() as folder:
            p = standard_copy(stream.getvalue(), Path(folder) / 'copy.webp')
            self.assertEqual(p['oriented_source_size'], [1200, 1800])
            self.assertEqual(p['crop_box'], [0, 300, 1200, 1500])


if __name__ == '__main__':
    unittest.main()
