import copy
import json
from pathlib import Path
import tempfile
import unittest
from pipeline.editorial import PipelineStop
from pipeline.v2.briefs import freeze, validate, slop_plan, pairs
from pipeline.v2.brief_review import cohort, validate_reviews, review_script


def plan():
    return dict(version='1.0.0', briefs=[dict(id='brief-001', medium='artwork', description='Un dipinto con una barca.',
        slop_prompt='An original painting depicting a boat.', search_queries=['boat painting', 'boat artwork'])])


class BriefPilotTest(unittest.TestCase):
    def test_common_brief_freezes_both_inputs_before_real_search_and_never_resubmits(self):
        class API:
            calls = 0
            def request(self, endpoint, body):
                self.calls += 1
                value = plan(); value['briefs'][0]['description'] = 'A painting with a boat.'
                return dict(status='completed', output=[dict(content=[dict(type='output_text', text=json.dumps(value))])]), 'req-fixture'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); api = API()
            value = freeze(root, api, count=1)
            self.assertEqual(slop_plan(value)['ideas'][0]['prompt'], value['briefs'][0]['slop_prompt'])
            self.assertEqual(freeze(root, api, count=1), value)
            self.assertEqual(api.calls, 1)
            self.assertTrue(json.loads((root/'briefs-frozen.json').read_text())['real_search_must_follow_freeze'])
            saved = (root/'brief-instructions.json').read_text()
            (root/'brief-instructions.json').write_text(json.dumps(dict(instructions='Changed after freeze')))
            with self.assertRaises(PipelineStop):freeze(root, api, count=1)
            (root/'brief-instructions.json').write_text(saved)
            (root/'slop-plan.json').write_text('{}')
            with self.assertRaises(PipelineStop):freeze(root, api, count=1)

    def test_no_real_reference_can_enter_the_generation_and_incomplete_pairs_stay_incomplete(self):
        for field in ('real_image', 'source_url', 'real_description'):
            value = copy.deepcopy(plan());value['briefs'][0][field] = 'forbidden'
            with self.assertRaises(PipelineStop):validate(value)
        value = copy.deepcopy(plan());value['briefs'][0]['slop_prompt'] = 'Copy https://example.invalid/image.jpg'
        with self.assertRaises(PipelineStop):validate(value)
        result = pairs(plan(), [dict(id='candidate', brief_id='brief-001', origin='REAL')])
        self.assertFalse(result[0]['complete']);self.assertIsNone(result[0]['slop'])
        with self.assertRaises(PipelineStop):pairs(plan(), [dict(id='candidate', brief_id='unknown', origin='REAL')])

    def test_owner_choices_are_bound_to_the_exact_final_file_and_do_not_change_candidate_approval(self):
        rows = [dict(id='one', origin='AI', sha256='a'*64, review_state='quarantine')]
        review = dict(version='1.0.0', kind='owner_editorial_choices', cohort_sha256=cohort(rows), decisions=[dict(
            candidate_id='one', image_sha256='a'*64, decision='approved', note='Composizione riuscita.', reviewed_at='2026-11-04T00:00:00Z')])
        self.assertEqual(validate_reviews(review, rows), review)
        self.assertEqual(rows[0]['review_state'], 'quarantine')
        altered=copy.deepcopy(review);altered['decisions'][0]['image_sha256']='b'*64
        with self.assertRaises(PipelineStop):validate_reviews(altered, rows)
        altered=copy.deepcopy(review);altered['decisions'].append(altered['decisions'][0])
        with self.assertRaises(PipelineStop):validate_reviews(altered, rows)

    def test_initial_owner_rejection_is_validated_and_notes_cannot_escape_the_gallery_script(self):
        rows = [dict(id='chair', origin='REAL', sha256='a'*64)]
        initial = dict(version='1.0.0', kind='owner_editorial_choices', cohort_sha256=cohort(rows), decisions=[dict(
            candidate_id='chair', image_sha256='a'*64, decision='rejected', note='</script><img src=x onerror=alert(1)>',
            reviewed_at='2026-11-04T00:00:00Z')])
        script = review_script(rows, initial, paired_view=True)
        self.assertEqual(script.count('</script>'), 1)
        self.assertNotIn('<img src=x', script)
        initial['decisions'][0]['image_sha256'] = 'b'*64
        with self.assertRaises(PipelineStop):review_script(rows, initial, paired_view=True)
