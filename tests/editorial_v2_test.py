import contextlib
import copy
from dataclasses import replace
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from pipeline.editorial import PipelineStop
from pipeline.v2.protocol import VERSION, PROFILE_INSTRUCTIONS, visual_profile, generation_plan, approval_blockers, provenance
from pipeline.v2.discovery import plan
from pipeline.v2.engine import Config, Engine, initialize, media
from pipeline.v2.fixtures import FixtureBatch, study_inputs, profile, picture
from pipeline.v2.benchmark import report, fixture_study, trial_metrics
from pipeline.v2.run import main
from pipeline.v2.licensing import slop_license

CONTRACT = json.loads(Path('tests/editorial-v2-contract.json').read_text())


class ProtocolV2Test(unittest.TestCase):
    def test_new_live_slop_defaults_to_attributed_cc_by_without_making_api_calls(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            cfg=Config(image_model='fixture',evaluator_model='fixture',run_usd=1,daily_usd=1,evaluation_usd=.01,generation_usd=.1)
            state=initialize('AI',CONTRACT['plan'],root,root/'run',cfg,'license-only-test',simulated=False)
            self.assertEqual(state['license'],dict(url='https://creativecommons.org/licenses/by/4.0/',author='Real or Slop'))
            self.assertEqual(state['jobs'],[])
            self.assertEqual(state['reserved_usd'],0)
        self.assertEqual(slop_license({'author':'A named contributor'})['author'],'A named contributor')
        with self.assertRaises(PipelineStop):slop_license({'url':'https://creativecommons.org/publicdomain/zero/1.0/'})

    def test_synchronous_generation_has_a_real_request_trace_without_batch_identifiers(self):
        proof = CONTRACT['synchronous_provenance']
        self.assertEqual(provenance(proof, 'AI')['transport'], 'synchronous')
        feedback = {**CONTRACT['feedback'], 'origin_evidence_ids': ['generation']}
        self.assertEqual(approval_blockers('AI', CONTRACT['profile'], proof, feedback), ['license_unresolved'])
        with self.assertRaises(PipelineStop):
            provenance({**proof, 'reference_id': 'photo'}, 'AI')
        with self.assertRaises(PipelineStop):
            provenance({**proof, 'batch_id': 'fake-batch'}, 'AI')

    def test_pending_rights_can_be_archived_but_never_approved(self):
        proof = {**CONTRACT['real_provenance'], 'license_url': None}
        self.assertEqual(approval_blockers('REAL', CONTRACT['profile'], proof, CONTRACT['feedback']), ['license_unresolved'])

    def test_ordinary_texture_is_eligible_without_surprise_or_concrete_motive(self):
        self.assertEqual(approval_blockers('REAL', CONTRACT['profile'], CONTRACT['real_provenance'], CONTRACT['feedback']), [])
        self.assertNotIn('score', visual_profile(CONTRACT['profile']))
        self.assertEqual(CONTRACT['profile']['surprise'], 0)

    def test_hybrids_unknown_origins_and_semantic_edits_cannot_be_real(self):
        for changes in ({'authenticity': 'hybrid'}, {'authenticity': 'uncertain'}, {'authenticity': 'unverified'}, {'semantic_edit': True}, {'content_kind': 'unknown'}):
            proof = {**CONTRACT['real_provenance'], **changes}
            self.assertIn('authenticity_not_verified', approval_blockers('REAL', CONTRACT['profile'], proof, CONTRACT['feedback']))
        for transformation in ('generative_fill', 'crop', 'restoration', 'upscaling'):
            with self.assertRaises(PipelineStop):
                provenance({**CONTRACT['real_provenance'], 'transformations': [transformation]}, 'REAL')

    def test_documented_artwork_does_not_need_photographic_style_or_external_context(self):
        proof = {**CONTRACT['real_provenance'], 'content_kind': 'artwork'}
        profile = {**CONTRACT['profile'], 'photographic': False}
        self.assertEqual(approval_blockers('REAL', profile, proof, CONTRACT['feedback']), [])
        self.assertEqual(approval_blockers('REAL', {**profile, 'usable': False}, proof, CONTRACT['feedback']), ['visual_eligibility'])

    def test_reference_images_and_legacy_priors_are_not_part_of_the_new_contract(self):
        for key in ('reference_id', 'reference_image', 'source_url', 'description', 'real_candidates', 'preferences', 'ranking'):
            value = copy.deepcopy(CONTRACT['plan'])
            value['ideas'][0][key] = 'forbidden'
            with self.subTest(key=key), self.assertRaises(PipelineStop):
                generation_plan(value)
        for prompt in ('Use https://example.invalid/photo.jpg', 'data:image/png;base64,AAA', 'reference_id=photo'):
            value = copy.deepcopy(CONTRACT['plan']); value['ideas'][0]['prompt'] = prompt
            with self.assertRaises(PipelineStop):
                generation_plan(value)
        for key in ('score', 'difficulty', 'source', 'label', 'prompt', 'concrete_motive'):
            with self.assertRaises(PipelineStop):
                visual_profile({**CONTRACT['profile'], key: 'forbidden'})
        with self.assertRaises(PipelineStop):
            visual_profile({**CONTRACT['profile'], 'surprise': True})
        with self.assertRaises(PipelineStop):
            visual_profile({**CONTRACT['profile'], 'ordinariness': float('nan')})

    def test_discovery_uses_independent_exploration_and_reproducible_multiengine_plans(self):
        free = dict(generator='test-independent-llm', queries=['quiet pavement', 'a shared gesture', 'small repairs', 'overhead photograph', 'unoccupied interior'])
        a = plan(34, free, engines=('commons', 'openverse'))
        self.assertEqual(a, plan(34, free, engines=('commons', 'openverse')))
        self.assertNotEqual(a, plan(35, free, engines=('commons', 'openverse')))
        self.assertEqual(len(a['queries']), 24)
        self.assertEqual({row['engine'] for row in a['queries']}, {'commons', 'openverse'})
        self.assertEqual({row['channel'] for row in a['queries']}, {'generic', 'vocabulary', 'exploration'})
        self.assertEqual(sum(row['channel'] == 'exploration' for row in a['queries']), 8)
        self.assertTrue(all('categories' not in row for row in a['queries']))
        self.assertTrue(all('unusual' not in row['query'] for row in a['queries']))


class BatchV2Test(unittest.TestCase):
    def engine(self, root, origin='AI', count=8, api=None):
        reals, slop = study_inputs(root / 'inputs', count)
        cfg = Config(evaluator_model='fixture-vision', image_model='fixture-image', run_usd=100, daily_usd=100, evaluation_usd=.01, generation_usd=.1)
        state = initialize(origin, reals if origin == 'REAL' else slop, root / 'inputs', root / 'work', cfg,
                           'fixture-' + origin, True, dict(url='https://creativecommons.org/publicdomain/zero/1.0/', author='Fixture'))
        return Engine(state, root / 'work', api or FixtureBatch())

    def complete(self, engine):
        for _ in range(20):
            result = engine.tick(execute=True)
            if result['status'] in ('completed', 'paused', 'cancelled', 'stopped'):
                return result
        self.fail('Run v2 did not terminate')

    def test_separate_flows_never_split_rank_or_feed_photos_to_generation(self):
        for origin in ('REAL', 'AI'):
            with self.subTest(origin=origin), tempfile.TemporaryDirectory() as temp:
                engine = self.engine(Path(temp), origin)
                self.assertEqual(self.complete(engine)['status'], 'completed')
                self.assertEqual(len(engine.state['candidates']), 4)
                self.assertEqual({row['origin'] for row in engine.state['candidates']}, {origin})
                self.assertEqual([job['stage'] for job in engine.state['jobs']], ['profile'] if origin == 'REAL' else ['generation', 'profile'])
                self.assertNotIn('ranked', engine.state)
                self.assertNotIn('preferences', engine.state)
                for job in engine.state['jobs']:
                    for item in job['items']:
                        payload = engine._body(item)
                        if job['stage'] == 'generation':
                            self.assertEqual(set(payload), {'model', 'prompt', 'n', 'size', 'quality'})
                            self.assertEqual(payload['prompt'], engine._attempt(item['target'])['idea']['prompt'])
                            self.assertNotIn('inputs/', json.dumps(payload))
                        else:
                            self.assertEqual(item['recipe']['context'], '')
                            self.assertEqual(payload['input'][0]['content'][0]['text'], PROFILE_INSTRUCTIONS)
                            self.assertNotIn('example.invalid', json.dumps(payload))
                self.assertEqual(engine.state['calls']['regeneration'], 0)
                if origin == 'AI':
                    self.assertFalse((engine.folder / 'inputs').exists())
                    self.assertTrue(all('reference_id' not in row['provenance'] for row in engine.state['candidates']))

    def test_resume_and_reconciliation_preserve_single_paid_submission(self):
        class LostResponse(FixtureBatch):
            def create_batch(self, *args):
                result = super().create_batch(*args)
                if len(self.batches) == 1:
                    raise PipelineStop('Fixture lost acknowledgement')
                return result
        with tempfile.TemporaryDirectory() as temp:
            engine = self.engine(Path(temp), api=LostResponse())
            first = engine.tick(execute=True)
            self.assertEqual(first['status'], 'paused')
            self.assertEqual(len(engine.api.batches), 1)
            restored = Engine(json.loads((engine.folder / 'state.json').read_text()), engine.folder, engine.api)
            self.assertEqual(self.complete(restored)['status'], 'completed')
            self.assertEqual(len(engine.api.batches), 2)
            self.assertEqual(restored.state['calls'], dict(evaluation=4, generation=4, regeneration=0))
            restored.tick(execute=True)
            self.assertEqual(len(engine.api.batches), 2)

    def test_collect_only_and_cancellation_never_start_new_paid_phases(self):
        with tempfile.TemporaryDirectory() as temp:
            engine = self.engine(Path(temp))
            engine.tick(execute=True)
            result = engine.tick(execute=False)
            self.assertEqual(result['status'], 'paused')
            self.assertEqual(len(engine.api.batches), 1)
            reserved = result['reserved_usd']
            self.assertEqual(engine.cancel()['status'], 'cancelled')
            self.assertEqual(len(engine.api.batches), 1)
            self.assertEqual(engine.state['reserved_usd'], reserved)
            self.assertTrue(list((engine.folder / 'generations').glob('*/original.png')))
            self.assertEqual(engine.state['candidates'], [])

    def test_invalid_results_pause_without_regeneration_and_legacy_state_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            engine = self.engine(Path(temp))
            engine.tick(execute=True)
            output = next(iter(engine.api.batches.values()))['output_file_id']
            engine.api.files[output].append(copy.deepcopy(engine.api.files[output][0]))
            self.assertEqual(engine.tick(execute=True)['status'], 'paused')
            self.assertEqual(len(engine.api.batches), 1)
            with self.assertRaises(PipelineStop):
                Engine({**engine.state, 'protocol_version': '1.0.0'}, engine.folder, engine.api)
            engine.state['simulated'] = False
            with self.assertRaises(PipelineStop):
                engine.tick(execute=True)

    def test_budgets_stop_before_submission(self):
        with tempfile.TemporaryDirectory() as temp:
            engine = self.engine(Path(temp))
            engine.cfg = replace(engine.cfg, run_usd=.001)
            self.assertEqual(engine.tick(execute=True)['status'], 'paused')
            self.assertEqual(engine.api.batches, {})

    def test_visual_token_budget_is_explicit_without_changing_image_generation(self):
        with tempfile.TemporaryDirectory() as temp:
            engine = self.engine(Path(temp), 'REAL')
            engine.cfg = replace(engine.cfg, max_output_tokens=3000, reasoning_effort='none')
            engine.tick(execute=False)
            request = engine._body(engine.state['jobs'][0]['items'][0])
            self.assertEqual(request['max_output_tokens'], 3000)
            self.assertEqual(request['reasoning'], {'effort': 'none'})

    def test_exact_real_duplicates_are_archived_without_repeated_visual_calls(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            reals, _ = study_inputs(root / 'inputs', 4)
            reals[1]['file'] = reals[0]['file']
            cfg = Config(evaluator_model='fixture', run_usd=1, daily_usd=1, evaluation_usd=.01)
            state = initialize('REAL', reals, root / 'inputs', root / 'work', cfg, 'duplicates', True)
            engine = Engine(state, root / 'work', FixtureBatch())
            self.assertEqual(self.complete(engine)['candidates'], 1)
            self.assertEqual(state['calls']['evaluation'], 1)
            self.assertEqual(state['attempts'][1]['duplicate_of'], reals[0]['id'])
            self.assertTrue((engine.folder / state['attempts'][1]['file']).exists())

    def test_presentation_keeps_whole_frame_and_normalizes_both_origins(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for kind in ('inputs', 'generations'):
                value = media(picture(34, (1600, 1200)), root, kind, kind)
                self.assertEqual((value['width'], value['height']), (1024, 768))
                self.assertEqual(value['presentation']['maximum_edge'], 1024)
                self.assertTrue(value['presentation']['whole_frame'])

    def test_default_cli_does_not_touch_network_or_create_generation_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); path = root / 'slop.json'; path.write_text(json.dumps(CONTRACT['plan']))
            with patch('pipeline.v2.run.BatchAPI', side_effect=AssertionError('No network')), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(main([str(path)]), 0)
            self.assertFalse(json.loads(output.getvalue())['paid'])
            self.assertEqual(list(root.iterdir()), [path])


class BenchmarkV2Test(unittest.TestCase):
    def test_fixture_study_is_reproducible_and_cannot_claim_editorial_validation(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            first = fixture_study(Path(a), 120)
            self.assertEqual(first, fixture_study(Path(b), 120))
            self.assertEqual(first['sample_size'], 120)
            self.assertEqual(first['origins'], {'REAL': 60, 'AI': 60})
            self.assertEqual(first['data_kind'], 'fixture')
            self.assertFalse(first['publication_ready'])
            self.assertFalse(first['matched_search_budget'])
            self.assertEqual(first['usable_after_human_review'], {})
            self.assertIsNone(first['transfer']['accuracy'])

    def test_transfer_excludes_repeated_exposures_and_trained_source_groups(self):
        rows = [dict(id='a', origin='REAL', provenance=CONTRACT['real_provenance']), dict(id='b', origin='REAL', provenance={**CONTRACT['real_provenance'], 'provider': 'new-source'})]
        trials = [dict(participant='anonymous-1', candidate_id='a', choice='REAL', phase='training'),
                  dict(participant='anonymous-1', candidate_id='a', choice='REAL', phase='evaluation'),
                  dict(participant='anonymous-1', candidate_id='b', choice='AI', phase='evaluation', confidence=.8),
                  dict(participant='anonymous-1', candidate_id='b', choice='REAL', phase='evaluation')]
        result = trial_metrics(rows, trials, {'source:documented-fixture', 'source:new-source'})
        self.assertEqual(result['valid_first_exposures'], 1)
        self.assertEqual(result['accuracy'], 0)
        self.assertAlmostEqual(result['brier_score'], .64)
        self.assertEqual(result['per_image']['b']['n'], 1)
        self.assertEqual(len(result['accuracy_wilson95']), 2)

    def test_profiles_with_unknown_values_preserve_missingness(self):
        value = profile(); value.update(composition=None, surprise=None)
        self.assertIsNone(visual_profile(value)['surprise'])
