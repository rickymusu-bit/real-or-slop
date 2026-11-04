import copy
import json
from pathlib import Path
import tempfile
import unittest

from pipeline.editorial import PipelineStop
from pipeline.v2.brief_catalog import DEFAULT_CATALOG, validate, select, freeze
from pipeline.v2.briefs import freeze as restore_briefs


class BriefCatalogTest(unittest.TestCase):
    def catalog(self):
        return json.loads(DEFAULT_CATALOG.read_text())

    def test_authored_seed_is_valid_varied_and_has_no_implied_approvals(self):
        value = validate(self.catalog())
        self.assertEqual(len(value['briefs']), 100)
        self.assertEqual({b['status'] for b in value['briefs']}, {'draft'})
        self.assertEqual(len({b['tags'][0] for b in value['briefs']}), 10)
        self.assertEqual(sum(b['medium'] == 'artwork' for b in value['briefs']), 10)

    def test_selection_is_reproducible_varied_and_excludes_retired_or_used_briefs(self):
        value = self.catalog()
        a = select(value, seed=34)
        self.assertEqual(a, select(value, seed=34))
        lookup = {b['id']: b for b in value['briefs']}
        self.assertGreaterEqual(len({lookup[b['id']]['tags'][0] for b in a['briefs']}), 4)
        selected = [b['id'] for b in a['briefs']]
        value['briefs'][0]['status'] = 'retired'
        b = select(value, count=5, seed=34, exclude=selected)
        self.assertTrue(set(selected).isdisjoint(r['id'] for r in b['briefs']))
        self.assertNotIn(value['briefs'][0]['id'], [r['id'] for r in b['briefs']])
        with self.assertRaises(PipelineStop):select(value, ids=[value['briefs'][0]['id']])

    def test_large_catalog_never_turns_into_a_large_image_cycle(self):
        value = self.catalog()
        for count in (0, 26, 100, True):
            with self.subTest(count=count), self.assertRaises(PipelineStop):select(value, count=count)
        with self.assertRaises(PipelineStop):select(value, ids=[b['id'] for b in value['briefs'][:26]])

    def test_duplicate_and_source_reference_records_are_rejected(self):
        for field in ('id', 'description', 'slop_prompt'):
            value = self.catalog();value['briefs'][1][field] = value['briefs'][0][field]
            with self.subTest(field=field), self.assertRaises(PipelineStop):validate(value)
        value = self.catalog();value['briefs'][0]['real_image_url'] = 'https://example.invalid/photo.jpg'
        with self.assertRaises(PipelineStop):validate(value)

    def test_frozen_catalog_cycle_restores_without_inference_and_detects_changes(self):
        class NoInference:
            def request(self, *args):raise AssertionError('No API calls for a catalogue selection')
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp); value = self.catalog()
            result = freeze(folder, value, count=5, seed=34)
            before = {p.name: p.read_bytes() for p in folder.iterdir()}
            self.assertEqual(result, freeze(folder, value, count=5, seed=34))
            self.assertEqual(before, {p.name: p.read_bytes() for p in folder.iterdir()})
            self.assertEqual(restore_briefs(folder, NoInference(), count=5), result)
            changed = copy.deepcopy(value);changed['briefs'][0]['revision'] += 1
            with self.assertRaises(PipelineStop):freeze(folder, changed, count=5, seed=34)
            source = folder/'catalog-selection.json';data=json.loads(source.read_text());data['seed'] += 1;source.write_text(json.dumps(data))
            with self.assertRaises(PipelineStop):freeze(folder, value, count=5, seed=34)

    def test_an_existing_llm_plan_is_never_overwritten_by_a_catalog_export(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); path = root/'briefs.json'; path.write_text('{"different":"plan"}')
            original = path.read_bytes()
            with self.assertRaises(PipelineStop):freeze(root, self.catalog())
            self.assertEqual(path.read_bytes(), original)
