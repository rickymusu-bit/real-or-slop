import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from pipeline.editorial import PipelineStop
from pipeline.v2.presentation import main as presentation_cli
from pipeline.v2.preserve_v1_0_0 import proportional_copy, export_preserved


def photo(width, height, exif=None):
    raw = io.BytesIO()
    Image.new("RGB", (width, height), "royalblue").save(raw, "JPEG", exif=exif)
    return raw.getvalue()


class PreserveAspectTest(unittest.TestCase):
    def test_landscape_portrait_square_and_panorama_without_crop_or_upscale(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for dims in [(3200, 1800), (1800, 3200), (640, 640),
                         (3900, 500), (500, 3900)]:
                with self.subTest(dims=dims):
                    raw = photo(*dims)
                    target = root / (str(dims[0]) + "x" + str(dims[1]) + ".webp")
                    result = proportional_copy(raw, target)
                    with Image.open(target) as preview:
                        actual = preview.size
                    self.assertLessEqual(max(actual), 2048)
                    self.assertEqual(result["crop_box"], None)
                    self.assertEqual(result["retained_area"], 1)
                    self.assertFalse(result["upscaled"])
                    self.assertLessEqual(abs(actual[0] / actual[1] - dims[0] / dims[1]),
                                         max(1 / min(actual), 1 / min(dims)))
                    self.assertEqual(result["source_sha256"], hashlib.sha256(raw).hexdigest())
                    self.assertEqual(result["sha256"], hashlib.sha256(target.read_bytes()).hexdigest())
                    self.assertEqual(result["operations"][-2:], ["compression", "format_conversion"])
                    with self.assertRaises(PipelineStop):
                        proportional_copy(raw, target)

    def test_exif_orientation_is_applied_without_cropping(self):
        exif = Image.Exif()
        exif[274] = 6
        raw = photo(800, 400, exif)
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "rotated.webp"
            record = proportional_copy(raw, target)
            self.assertEqual(record["oriented_source_size"], [400, 800])
            self.assertEqual((record["width"], record["height"]), (400, 800))
            self.assertEqual(record["crop_box"], None)

    def test_new_cli_defaults_to_proportional_and_never_spends_money(self):
        from pipeline.v2.engine import media
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            raw = photo(1000, 500)
            row = dict(id="wide", **media(raw, base, "inputs", "wide"))
            manifest = base / "state.json"
            manifest.write_text(json.dumps({"candidates": [row]}))
            result = export_preserved([manifest], base / "preserved")
            self.assertEqual(result["crop_policy"], "never")
            entry = json.loads((base / "preserved/variants.json").read_text())["variants"][0]
            self.assertIsNone(entry["presentation"]["crop_box"])
            self.assertEqual(entry["presentation"]["width"], 1000)
            self.assertEqual(entry["presentation"]["height"], 500)
            self.assertEqual((base / "preserved/previous-frame/wide.webp").is_file(), True)
            # The normal CLI must now choose preservation without Terra budgets.
            with contextlib.redirect_stdout(io.StringIO()) as output:
                presentation_cli(["--states", str(manifest), "--out", str(base / "cli-copy")])
            report = json.loads(output.getvalue())
            self.assertEqual(report["crop_policy"], "never")
            self.assertFalse(report["paid"])


if __name__ == "__main__":
    unittest.main()
