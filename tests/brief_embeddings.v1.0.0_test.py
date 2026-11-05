import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from pipeline.editorial import PipelineStop
from pipeline.v2.brief_catalog import (
    LEGACY_CATALOG, ENGLISH_CATALOG, TAG_VOCABULARY,
    checksum, validate, validate_english, validate_vocabulary, freeze,
)
from pipeline.v2.briefs import freeze as generate

ROOT = Path(__file__).resolve().parents[1]


class EnglishCatalogTest(unittest.TestCase):
    def setUp(self):
        self.legacy = json.loads(LEGACY_CATALOG.read_text())
        self.english = json.loads(ENGLISH_CATALOG.read_text())
        self.vocabulary = json.loads(TAG_VOCABULARY.read_text())

    def test_complete_migration_preserves_schema_history_and_independence(self):
        ledger = json.loads((ROOT/'data/editorial/brief-migration.v1.0.0.json').read_text())
        self.assertEqual(hashlib.sha256(LEGACY_CATALOG.read_bytes()).hexdigest(), ledger['source']['sha256'])
        self.assertEqual(checksum(self.legacy), ledger['source']['content_sha256'])
        self.assertEqual(checksum(self.english), ledger['target']['content_sha256'])
        self.assertEqual(len(validate(self.english)['briefs']), 100)
        self.assertEqual(set(self.legacy), set(self.english))
        self.assertEqual(set(self.vocabulary['legacy_to_canonical']), {t for b in self.legacy['briefs'] for t in b['tags']})
        self.assertNotEqual(self.vocabulary['legacy_to_canonical']['paesaggio'], self.vocabulary['legacy_to_canonical']['paesaggi'])
        self.assertIn('not_owner_approved', ledger['review_status'])
        for old, new, entry in zip(self.legacy['briefs'], self.english['briefs'], ledger['entries'], strict=True):
            self.assertEqual(set(old), set(new))
            self.assertEqual(new['revision'], old['revision'] + 1)
            self.assertEqual(new['id'], entry['brief_id'])
            self.assertEqual(checksum(old), entry['source_sha256'])
            self.assertEqual(checksum(new), entry['target_sha256'])
            self.assertEqual(new['tags'], list(dict.fromkeys(self.vocabulary['legacy_to_canonical'][t] for t in old['tags'])))
            for field in entry['preserved_fields']:
                self.assertEqual(old[field], new[field])

    def test_legacy_still_valid_but_cannot_be_indexed_as_canonical_english(self):
        validate(self.legacy)
        with self.assertRaises(PipelineStop): validate_english(self.legacy)
        for field, value in [('description', self.legacy['briefs'][0]['description']),
                             ('slop_prompt', 'Un ritratto con la stanza visibile.'),
                             ('tags', ['portraits', 'ritratto_ambientato']),
                             ('tags', ['portraits', 'Portrait']), ('tags', ['portrait']),
                             ('tags', ['portraits', 'portraits']), ('tags', ['new_tag_without_vocabulary']),
                             ('tags', ['environmental-portrait'])]:
            altered = copy.deepcopy(self.english); altered['briefs'][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(PipelineStop): validate(altered)
        for field in self.english['briefs'][0]:
            altered = copy.deepcopy(self.english); del altered['briefs'][0][field]
            with self.subTest(missing=field), self.assertRaises(PipelineStop): validate(altered)

    def test_additional_real_queries_may_use_other_languages(self):
        altered = copy.deepcopy(self.english)
        altered['briefs'][0]['search_queries'][1] = 'ritratto vicino a una finestra stanza'
        self.assertEqual(validate(altered), altered)
        altered['briefs'][0]['description_it'] = self.legacy['briefs'][0]['description']
        with self.assertRaises(PipelineStop): validate(altered)

    def test_vocabulary_extension_requires_explicit_canonical_definition(self):
        altered = copy.deepcopy(self.english)
        altered['briefs'][0]['tags'] = ['portraits', 'side_lighting']
        with self.assertRaises(PipelineStop): validate_english(altered, self.vocabulary)
        vocabulary = copy.deepcopy(self.vocabulary)
        vocabulary['tags']['side_lighting'] = 'Light coming from the side of the subject.'
        self.assertEqual(validate_english(altered, vocabulary), altered)
        for tag in ('SideLighting', 'side-lighting', 'ritratti'):
            invalid = copy.deepcopy(vocabulary); invalid['tags'][tag] = 'Invalid canonical tag.'
            with self.subTest(tag=tag), self.assertRaises(PipelineStop): validate_vocabulary(invalid)
        vocabulary['tags']['portrait'] = 'A redundant synonym for portraits.'
        with self.assertRaises(PipelineStop): validate_vocabulary(vocabulary)

    def test_frozen_legacy_cycles_keep_bytes_and_restore_without_translation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plan = freeze(root, self.legacy)
            before = {p.name: p.read_bytes() for p in root.iterdir()}
            with self.assertRaises(PipelineStop): freeze(root, self.english)
            self.assertEqual(freeze(root, self.legacy), plan)
            self.assertEqual(before, {p.name: p.read_bytes() for p in root.iterdir()})
            other = root/'english'
            freeze(other, self.english)
            selected = json.loads((other/'catalog-selection.json').read_text())
            self.assertTrue(all(row['revision'] == 2 for row in selected['selected']))

    def test_new_generated_briefs_require_english_but_restore_keeps_old_italian(self):
        class API:
            def request(inner, endpoint, body):
                row = {k: self.legacy['briefs'][0][k] for k in ('id', 'medium', 'description', 'slop_prompt', 'search_queries')}
                row['id'] = 'brief-001'
                value = dict(version='1.0.0', briefs=[row])
                return dict(status='completed', output=[dict(content=[dict(type='output_text', text=json.dumps(value))])]), 'fixture'
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            with self.assertRaises(PipelineStop): generate(folder, API(), count=1)
            self.assertFalse((folder/'briefs-frozen.json').exists())
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            frozen = freeze(folder, self.legacy, count=1)
            self.assertEqual(generate(folder, None, count=1), frozen)


if __name__ == '__main__':
    unittest.main()
