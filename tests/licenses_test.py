import json
import tempfile
import unittest
from pathlib import Path
from pipeline.licenses import LICENSES, recognized_license
from pipeline.run import connect, ingest, rights_check

CASES = json.loads((Path(__file__).parent / 'license-cases.json').read_text())


class LicensePolicyTest(unittest.TestCase):
    def test_same_published_identities_and_aliases_as_worker(self):
        for case in CASES['accepted']:
            with self.subTest(url=case['input']):
                self.assertEqual(recognized_license(case['input']), {'url': case['url'], 'name': case['name']})
        for url, name in LICENSES.items():
            self.assertEqual(recognized_license(url), {'url': url, 'name': name})

    def test_ambiguous_urls_and_unpublished_licenses_or_ports(self):
        for value in CASES['rejected']:
            with self.subTest(value=value):
                self.assertIsNone(recognized_license(value))

    def test_pipeline_retains_source_rights_and_requires_review(self):
        row = json.loads(Path('pipeline/fixtures.json').read_text())[0]
        original = 'http://creativecommons.org/licenses/by-sa/3.0/de/deed.en'
        row = {**row, 'rights': original}
        self.assertEqual(rights_check(row), 'eligible-needs-review')
        with tempfile.TemporaryDirectory() as folder:
            db = connect(Path(folder) / 'queue.sqlite')
            config = {'max_results': 1, 'licenses': ['CC BY-SA 3.0 DE']}
            ingest(db, [row], config, folder=Path(folder))
            item = json.loads(db.execute('SELECT metadata FROM candidates').fetchone()[0])
            self.assertEqual(item['rights'], original)
            self.assertEqual(item['license_url'], 'https://creativecommons.org/licenses/by-sa/3.0/de/')
            self.assertEqual(item['license_name'], 'CC BY-SA 3.0 DE')
            self.assertEqual(item['rights_assessment'], 'eligible-needs-review')
            self.assertEqual(item['status'], 'in-review')
            db.close()

    def test_explicit_license_filter_does_not_upgrade_or_remove_ports(self):
        row = json.loads(Path('pipeline/fixtures.json').read_text())[0]
        row = {**row, 'rights': 'https://creativecommons.org/licenses/by-sa/3.0/de/'}
        for requested in ['CC BY-SA 3.0', 'CC BY-SA 4.0']:
            with self.subTest(requested=requested), tempfile.TemporaryDirectory() as folder:
                db = connect(Path(folder) / 'queue.sqlite')
                ingest(db, [row], {'max_results': 1, 'licenses': [requested]}, folder=Path(folder))
                item = json.loads(db.execute('SELECT metadata FROM candidates').fetchone()[0])
                self.assertEqual(item['rights_assessment'], 'outside-license-filter')
                db.close()

    def test_nc_nd_candidates_keep_their_conditions_and_remain_in_review(self):
        fixture = json.loads(Path('pipeline/fixtures.json').read_text())[0]
        for case in CASES['accepted'][12:]:
            with self.subTest(license=case['name']), tempfile.TemporaryDirectory() as folder:
                db = connect(Path(folder) / 'queue.sqlite')
                row = {**fixture, 'rights': case['input']}
                ingest(db, [row], {'max_results': 1, 'licenses': [case['name']]}, folder=Path(folder))
                saved = json.loads(db.execute('SELECT metadata FROM candidates').fetchone()[0])
                self.assertEqual(saved['rights'], case['input'])
                self.assertEqual(saved['license_name'], case['name'])
                self.assertEqual(saved['license_url'], case['url'])
                self.assertEqual(saved['rights_assessment'], 'eligible-needs-review')
                self.assertEqual(saved['status'], 'in-review')
                db.close()
