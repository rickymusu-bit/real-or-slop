import contextlib
from datetime import date
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
import hashlib
from pipeline import automatic
from pipeline.providers import Client

class AutomaticPipelineTest(unittest.TestCase):
    def test_plan_is_bounded_diverse_stable_and_network_free(self):
        day=date(2026,11,1)
        plan=automatic.plan(day)
        self.assertEqual(plan,automatic.plan(day))
        self.assertEqual(plan['limit'],20)
        self.assertEqual(len({q['query'] for q in plan['queries']}),5)
        self.assertTrue(all(q['offset']<1000 for q in plan['queries']))
        Client('RealOrSlop/1.0 (+'+automatic.SITE+'/)')
        with patch('pipeline.automatic.collect') as collect,patch('pipeline.automatic.apply') as apply,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(automatic.main([]),0)
            collect.assert_not_called();apply.assert_not_called()

    def test_collect_preserves_originals_and_deduplicates_across_runs(self):
        buffer=io.BytesIO();Image.new('RGB',(5,4),(32,64,96)).save(buffer,format='PNG');raw=buffer.getvalue()
        source=dict(provider='commons',source_id='one',title='File:Test',source_url='https://commons.wikimedia.org/wiki/File:Test',
            image_url='https://upload.wikimedia.org/test.png',author='<a>Author &amp; team</a>',evidence=json.dumps({'ImageDescription':{'value':'Source caption'}}),rights='https://creativecommons.org/publicdomain/zero/1.0/')
        with tempfile.TemporaryDirectory() as tmp,patch.object(automatic.PROVIDERS['commons'],'search',side_effect=lambda *a,**k:iter([source])),patch('pipeline.run.download',return_value=(raw,hashlib.sha256(raw).hexdigest(),'0'*16)),patch('pipeline.importer.request') as remote:
            manifest=automatic.collect(Path(tmp),date(2026,11,1));items=json.loads(manifest.read_text())
            self.assertEqual(len(items),1);self.assertEqual(items[0]['metadata']['author'],'Author & team')
            self.assertEqual(Path(items[0]['file']).read_bytes(),raw)
            self.assertEqual(json.loads(automatic.collect(Path(tmp),date(2026,11,2)).read_text()),[])
            remote.assert_not_called()

    def test_old_apply_enters_editorial_gate_instead_of_importing_unranked_real(self):
        with patch('pipeline.editorial.main',return_value=0) as editorial:
            self.assertEqual(automatic.apply(Path('/tmp/private'),date(2026,11,1)),0)
        self.assertIn('--execute',editorial.call_args.args[0])

    def test_collection_scans_multiple_queries_and_caps_each_topic_after_technical_checks(self):
        import random
        from collections import Counter
        def search(client,query,limit,offset=0):
            for index in range(8):
                uid=hashlib.sha256((query+str(offset)+str(index)).encode()).hexdigest()
                yield dict(provider='commons',source_id=uid,title='File:'+uid,source_url='https://commons.wikimedia.org/wiki/File:'+uid,
                    image_url='https://upload.wikimedia.org/'+uid+'.png',author='Fixture',evidence='{}',
                    rights='unknown' if index<2 else 'https://creativecommons.org/publicdomain/zero/1.0/')
        def download(row,*args):
            rng=random.Random(row['source_id']);image=Image.frombytes('RGB',(24,20),rng.randbytes(24*20*3))
            raw=io.BytesIO();image.save(raw,format='PNG');raw=raw.getvalue()
            return raw,hashlib.sha256(raw).hexdigest(),hashlib.sha256(row['source_id'].encode()).hexdigest()[:16]
        with tempfile.TemporaryDirectory() as tmp,patch.object(automatic.PROVIDERS['commons'],'search',side_effect=search) as queries,patch('pipeline.run.download',side_effect=download):
            rows=json.loads(automatic.collect(Path(tmp),date(2026,11,1)).read_text())
            self.assertEqual(len(rows),20)
            self.assertEqual(sorted(Counter(tuple(row['metadata']['categories']) for row in rows).values()),[4]*5)
            self.assertEqual(queries.call_count,10)
        with tempfile.TemporaryDirectory() as tmp,patch.object(automatic.PROVIDERS['commons'],'search',side_effect=search),patch('pipeline.run.download',side_effect=download):
            manifest=automatic.collect(Path(tmp),date(2026,11,2),limit=2)
            self.assertEqual(len(json.loads(manifest.read_text())),2)
            self.assertEqual(json.loads((Path(tmp)/'collection.json').read_text())['limit'],2)

    def test_bounded_first_run_enforces_requested_limit_and_rejects_invalid_sizes(self):
        day=date(2026,11,2)
        self.assertEqual(automatic.plan(day,2)['limit'],2)
        for limit in (0,21,True,2.5,'2'):
            with self.assertRaises(ValueError):automatic.plan(day,limit)
        with patch('pipeline.automatic.collect') as collect,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(automatic.main(['--collect','--limit','2']),0)
            self.assertEqual(collect.call_args.args[2],2)

    def test_remote_duplicates_are_skipped_before_the_small_lot_is_full(self):
        import random
        old=dict(provider='commons',source_id='old',source_url='https://commons.wikimedia.org/wiki/File:old')
        def search(client,query,limit,offset=0):
            for uid in ['old',hashlib.sha256((query+str(offset)).encode()).hexdigest()]:
                yield dict(provider='commons',source_id=uid,title='File:'+uid,source_url='https://commons.wikimedia.org/wiki/File:'+uid,
                    image_url='https://upload.wikimedia.org/'+uid+'.png',author='Fixture',evidence='{}',rights='https://creativecommons.org/publicdomain/zero/1.0/')
        def download(row,*args):
            self.assertNotEqual(row['source_id'],'old')
            raw=io.BytesIO();Image.frombytes('RGB',(24,20),random.Random(row['source_id']).randbytes(24*20*3)).save(raw,format='PNG')
            return raw.getvalue(),hashlib.sha256(raw.getvalue()).hexdigest(),hashlib.sha256(row['source_id'].encode()).hexdigest()[:16]
        with tempfile.TemporaryDirectory() as tmp,patch.object(automatic.PROVIDERS['commons'],'search',side_effect=search),patch('pipeline.run.download',side_effect=download):
            rows=json.loads(automatic.collect(Path(tmp),date(2026,11,2),limit=2,known=[old]).read_text())
            self.assertEqual(len(rows),2)
            self.assertNotIn('old',[row['metadata']['source_id'] for row in rows])

    def test_private_collection_uses_inventory_references_and_pending_claims(self):
        state=dict(preferences=None,references=[{'id':'ref'}],inventory=[{'id':'image'}],claims=[{'id':'claim'}])
        with tempfile.TemporaryDirectory() as tmp,patch.dict('os.environ',{'REAL_OR_SLOP_ADMIN_TOKEN':'x'*40}),patch('pipeline.importer.request',return_value=state) as request,patch('pipeline.automatic.collect') as collect:
            self.assertEqual(automatic.main(['--collect','--limit','2','--preferences','--out',tmp]),0)
            self.assertEqual(request.call_args.args[2],'/api/admin/editorial/state')
            self.assertEqual(collect.call_args.kwargs['known'],[{'id':'ref'},{'id':'image'},{'id':'claim'}])
