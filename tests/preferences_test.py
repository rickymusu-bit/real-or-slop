import json
from datetime import date
from pathlib import Path
import random
import tempfile
import unittest
from pipeline.preferences import model, probability, order, creative_hint
from pipeline.automatic import plan
from pipeline.editorial import execute, Budget, BRIEF, RUBRIC
from editorial_pipeline_test import batch, config, Oracle

class PreferencesTest(unittest.TestCase):
    def snapshot(self):
        return model(dict(observations=200,counts=[dict(feature='visual:quiet_scene',approved=0,rejected=100),dict(feature='visual:active_scene',approved=100,rejected=0),dict(feature='category:trasporti',approved=0,rejected=80)]))

    def test_learning_is_regularized_and_exploration_never_excludes(self):
        state=self.snapshot(); rng=random.Random(43); first=[]
        self.assertGreater(probability(['visual:quiet_scene'],state),0)
        self.assertEqual(probability(['unknown'],state),.5)
        for _ in range(5000): first.append(order(['quiet_scene','active_scene'],lambda tag:['visual:'+tag],state,rng)[0])
        self.assertGreater(first.count('quiet_scene'),500)
        self.assertLess(first.count('quiet_scene'),1500)

    def test_guidance_is_soft_reproducible_and_sometimes_unguided(self):
        hints=[creative_hint(self.snapshot(),str(n)) for n in range(200)]
        self.assertTrue(any(h['mode']=='guided' and h['less_often'] for h in hints))
        self.assertTrue(any(h['mode']=='exploration' and not h['less_often'] and not h['prefer'] for h in hints))
        self.assertEqual(hints[0],creative_hint(self.snapshot(),'0'))
        self.assertEqual(creative_hint(None,'0')['mode'],'neutral')
        self.assertEqual(model({'counts':[{'feature':'visual:invented','approved':1,'rejected':0}]})['counts'],[])

    def test_search_uses_preferences_before_the_single_ranking_and_preserves_diversity(self):
        state=self.snapshot(); plans=[plan(date(2026,11,day),20,state) for day in range(1,20)]
        self.assertTrue(any(any('ship' in q['query'] or 'market' in q['query'] or 'laboratory' in q['query'] for q in p['queries']) for p in plans))
        for p in plans:
            self.assertEqual(len(p['queries']),5)
            self.assertGreaterEqual(len({q['categories'][0] for q in p['queries']}),3)
        self.assertEqual(plan(date(2026,11,1),20,state),plans[0])

    def test_guidance_does_not_change_ranking_roles_thresholds_or_blind_assessment(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);cfg=config();api=Oracle([90,80,30,10]);rows=batch(root,4)
            counts=execute(rows,root,root/'out',cfg,api,Budget(cfg),preferences=self.snapshot())
            self.assertEqual(counts,dict(ranked=4,real=2,slop=2))
            ranked=json.loads((root/'out/ranking.json').read_text())
            self.assertEqual([r['evaluation']['score'] for r in ranked],[90,80,30,10])
            self.assertEqual([r['role'] for r in ranked],['REAL','REAL','SLOP','SLOP'])
            self.assertTrue(all(not call[3] for call in api.observed if call[1]==RUBRIC))
            self.assertTrue(all('editorial_preferences' in call[3] for call in api.observed if call[1]==BRIEF))
            for path in (root/'out/attempts').glob('*.json'):
                record=json.loads(path.read_text());self.assertEqual(record['preferences']['observations'],200)
                self.assertEqual(record['preferences']['exploration'],.25)

    def test_incompatible_model_and_missing_admin_secret_stop_before_collection(self):
        from unittest.mock import patch
        import contextlib
        import io
        from pipeline.automatic import main
        with self.assertRaises(ValueError): model({'version':'99.0.0'})
        with patch.dict('os.environ',{'REAL_OR_SLOP_ADMIN_TOKEN':''}),patch('pipeline.automatic.collect') as collect,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(['--collect','--preferences']),1)
            collect.assert_not_called()

    def test_generation_snapshot_is_private_frozen_and_reused_during_resume(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);cfg=config();api=Oracle([90,10]);state=self.snapshot()
            execute(batch(root,2),root,root/'out',cfg,api,Budget(cfg),preferences=state)
            saved=json.loads((root/'out/preferences.json').read_text())
            ranking=json.loads((root/'out/ranking.json').read_text())
            before=len(api.prompts)
            execute([],root,root/'out',cfg,api,Budget(cfg),resume=ranking,preferences=model())
            self.assertEqual(saved,json.loads((root/'out/preferences.json').read_text()))
            self.assertEqual(saved['observations'],200)
            self.assertEqual((root/'out/preferences.json').stat().st_mode & 0o777,0o600)
            self.assertEqual(len(api.prompts),before)
