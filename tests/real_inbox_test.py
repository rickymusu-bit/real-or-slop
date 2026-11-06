import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from pipeline.editorial import PipelineStop
from pipeline.real.inbox import export_pending, synchronize
from pipeline.real.review import VISUAL_INSTRUCTIONS
from pipeline.real.store import Store
from pipeline.real.workflow import initialize, advance
from pipeline.real.contracts import digest
from pipeline.v2.engine import media
from pipeline.v2.fixtures import picture

INTENT = dict(version='1.0.0', taxonomy_version='1.0.0', topic='animals', emotion='compassion', intensity='medium')


class InboxTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = Store(self.temp.name)
        self.store.freeze(INTENT, simulated=False)
        self.row = dict(id='synthetic-test', blockers=['license_unresolved'], features=None, review_state='pending',
            provenance=dict(kind='REAL',provider='commons',source_id='test-source',source_url='https://example.org/source',
                            license_url=None,author='SYNTHETIC UNIT TEST'),
            attestation=dict(reviewer='SYNTHETIC UNIT TEST',rights_verified=False), visual=dict(usable=False),
            **media(picture(1,(128,96)),self.store.folder,'inputs','synthetic-test'))

    def test_pending_manifest_includes_blocked_low_score_candidates_without_owner_approval(self):
        result = export_pending(self.store,[self.row])
        manifest = json.loads(Path(result['manifest']).read_text())
        image = manifest['images'][0]
        self.assertEqual(image['sha256'],self.row['sha256'])
        self.assertIsNone(image['pair_key'])
        self.assertNotIn('status',image)
        self.assertEqual(image['metadata']['provenance']['blockers'],['license_unresolved'])
        self.assertFalse(image['metadata']['provenance']['human_rights_confirmed'])
        self.assertFalse(result['published'])
        self.assertEqual(result,export_pending(self.store,[self.row]))

    def test_duplicate_pixels_share_one_site_image_and_keep_candidate_references(self):
        other={**self.row,'id':'second-source'}
        result=export_pending(self.store,[self.row,other])
        images=json.loads(Path(result['manifest']).read_text())['images']
        self.assertEqual(len(images),1)
        self.assertEqual(images[0]['metadata']['source_candidates'],['synthetic-test','second-source'])

    def test_fixture_and_changed_pixels_fail_before_upload_or_export(self):
        fake=Store(self.store.folder/'fixture');fake.freeze(INTENT,simulated=True)
        with self.assertRaises(PipelineStop):export_pending(fake,[self.row])
        (self.store.folder/self.row['derived_file']).write_bytes(b'changed')
        with self.assertRaises(PipelineStop):export_pending(self.store,[self.row])
        self.assertEqual(list(self.store.folder.glob('review-inbox.*.json')),[])

    def api(self,status='pending',bad_pixels=False,deleted=False):
        row=self.row;folder=self.store.folder
        class API:
            account='test-account';database='test-database';bucket='private-test-bucket'
            def query(self,sql,params):
                if 'deleted_images' in sql:return [dict(sha256=row['sha256'])] if deleted else []
                if deleted:return []
                return [dict(id='existing-site-id',origin='REAL',source_sha256=row['sha256'],sha256=row['sha256'],
                             media_key='private/pixels',status=status,revision=7 if status=='approved' else 0)]
            def pixels(self,key):return b'wrong' if bad_pixels else (folder/row['derived_file']).read_bytes()
        return API

    def test_sync_reuses_canonical_uploader_and_verifies_site_pixels_without_resetting_a_vote(self):
        exported=export_pending(self.store,[self.row]);calls=[]
        def runner(args,**kwargs):calls.append(args);return SimpleNamespace(returncode=0)
        result=synchronize(self.store,exported,runner=runner,api_factory=self.api(status='approved'))
        self.assertIn('sync-review-inbox.py',calls[0][1])
        self.assertIn('--apply',calls[0])
        self.assertEqual(result['pending'],0)
        self.assertEqual(result['images'][0]['id'],'existing-site-id')
        self.assertEqual(result['images'][0]['status'],'approved')
        self.assertEqual(result['images'][0]['revision'],7)
        self.assertFalse(result['published'])

    def test_import_success_without_matching_remote_pixels_is_not_reported_as_synced(self):
        exported=export_pending(self.store,[self.row])
        with self.assertRaises(PipelineStop):
            synchronize(self.store,exported,runner=lambda *a,**k:SimpleNamespace(returncode=0),api_factory=self.api(bad_pixels=True))
        self.assertEqual(list(self.store.folder.glob('review-inbox-sync.*.json')),[])

    def test_deleted_images_remain_excluded_and_changed_manifest_cannot_upload(self):
        exported=export_pending(self.store,[self.row])
        result=synchronize(self.store,exported,runner=lambda *a,**k:SimpleNamespace(returncode=0),api_factory=self.api(deleted=True))
        self.assertEqual(result['deleted_excluded'],1)
        self.assertEqual(result['images'],[])
        path=Path(exported['manifest']);path.write_text('{}')
        def forbidden(*a,**k):raise AssertionError('Upload must not start')
        with self.assertRaises(PipelineStop):synchronize(self.store,exported,runner=forbidden,api_factory=forbidden)

    def test_real_cycle_waits_for_site_sync_and_does_not_hide_an_unusable_image(self):
        import shutil
        target=Store(self.store.folder/'real-cycle')
        initialize(target,INTENT,model='gpt-6.1-terra',run_id='test-inbox-cycle')
        shutil.copytree(self.store.folder/'inputs',target.folder/'inputs')
        row=copy.deepcopy(self.row);row['blockers']=[]
        row['visual']=dict(photographic=True,usable=False,attention=0,readability=0,game_potential=0)
        row['profile_image_sha256']=row['sha256']
        target.save('documented.v1.0.0.json',[row],immutable=True)
        target.save('profiled.r1.v1.0.0.json',[row],immutable=True)
        target.save('plan.r1.v1.0.0.json',dict(queries=[]),immutable=True)
        target.save('collection.r1.v1.0.0.json',dict(proposed_queries=1,skipped=[]),immutable=True)
        target.save('retrieval/'+('a'*64)+'.json',dict(status='completed',candidates=[dict(provider='commons',
            source_id='test-source',title='Synthetic test')],identity=dict(revision=1)),immutable=True)
        first=advance(target)
        self.assertEqual(first['stage'],'awaiting_inbox_sync')
        self.assertEqual(first['review_inbox']['images'],1)
        self.assertEqual(first['shortlist'],[])
        queued=dict(pending=1,images=[dict(status='pending')],published=False)
        with patch('pipeline.real.inbox.synchronize',return_value=queued) as sync:
            second=advance(target,sync_inbox=True)
        sync.assert_called_once()
        self.assertEqual(second['stage'],'awaiting_review')
        self.assertEqual(second['approved'],0)
        self.assertNotIn('handoff',second)
