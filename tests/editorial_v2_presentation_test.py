import hashlib
import io
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from pipeline.editorial import PipelineStop
from pipeline.v2.presentation import standard_copy, whole_frame_copy


class PresentationTest(unittest.TestCase):
    def test_full_frame_preserves_borders_aspect_and_small_image_size(self):
        with tempfile.TemporaryDirectory() as folder:
            for width, height in ((1600, 900), (900, 1600), (80, 120)):
                image = Image.new('RGB', (width, height), 'green')
                image.paste('red', (0, 0, 8, height))
                image.paste('blue', (width - 8, 0, width, height))
                raw = io.BytesIO(); image.save(raw, 'PNG')
                path = Path(folder) / f'{width}-{height}.webp'
                p = whole_frame_copy(raw.getvalue(), path)
                self.assertTrue(p['whole_frame'])
                self.assertEqual(p['crop_box'], [0, 0, width, height])
                self.assertEqual(p['retained_area'], 1)
                self.assertFalse(p['upscaled'])
                self.assertNotIn('center_crop', p['operations'])
                self.assertAlmostEqual(p['width'] / p['height'], width / height, delta=.002)
                with Image.open(path) as result:
                    self.assertLessEqual(max(result.size), 1536)
                    self.assertGreater(result.getpixel((0, result.height // 2))[0], 180)
                    self.assertGreater(result.getpixel((result.width - 1, result.height // 2))[2], 180)
                if width == 80:
                    self.assertEqual((p['width'], p['height']), (80, 120))

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
