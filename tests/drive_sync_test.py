"""Offline contract tests: no live Drive/Cloudflare calls."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "drive_sync", Path(__file__).resolve().parents[1] / "scripts" / "sync-drive.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

ORIGINAL = {"id": "drive_original_00001", "name": "bridge.jpg", "mimeType": "image/jpeg", "size": "400"}
FILES = {"bridge.jpg": ORIGINAL}
REAL = {
    "ready": True, "filename": "bridge.jpg", "type": "REAL",
    "title": "Ponte reale", "author": "Archivio", "source_url": "https://example.org/archive",
    "source_id": "sample-001", "provider": "example", "evidence": "Verifica umana richiesta",
    "explanation": "Provenienza da verificare", "categories": ["ingegneria"],
    "difficulty": "medio", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
}
class DriveCatalogTests(unittest.TestCase):
    def test_ready_real_is_paired_and_private_flags_removed(self):
        meta, image = module.validate_manifest(REAL, FILES)
        self.assertEqual(image["id"], ORIGINAL["id"])
        self.assertNotIn("ready", meta)
        self.assertNotIn("filename", meta)

    def test_not_ready_is_ignored(self):
        self.assertIsNone(module.validate_manifest({**REAL, "ready": False}, FILES))

    def test_missing_image_and_path_escape_are_rejected(self):
        for data in ({**REAL, "filename": "absent.jpg"}, {**REAL, "filename": "../bridge.jpg"}):
            with self.assertRaises(ValueError):
                module.validate_manifest(data, FILES)

    def test_ai_requires_provenance(self):
        with self.assertRaises(ValueError):
            module.validate_manifest({**REAL, "type": "AI"}, FILES)
        ai = {**REAL, "type": "AI", "ai_model": "Model", "ai_prompt": "Prompt",
              "generation_date": "2026-10-28", "owner_declaration": True}
        self.assertEqual(module.validate_manifest(ai, FILES)[0]["type"], "AI")

    def test_only_https_noncredential_site_urls(self):
        self.assertEqual(module.site_url("https://example.org/"), "https://example.org")
        self.assertEqual(module.site_url("http://localhost:8787"), "http://localhost:8787")
        for url in ("http://example.org", "https://user:pass@example.org", "https://example.org/admin"):
            with self.assertRaises(ValueError):
                module.site_url(url)

if __name__ == "__main__":
    unittest.main()
