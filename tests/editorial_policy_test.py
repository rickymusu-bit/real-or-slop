import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from editorial_schema_test import database, photo, image
from pipeline.editorial import AXES
from pipeline.reconsider import reconsider


class EditorialPolicyTest(unittest.TestCase):
    def test_threshold_change_is_audited_and_invalidates_prepared_tokens(self):
        db = database(); image(db, 'pending', 'AI')
        db.execute("INSERT INTO editorial_preparations VALUES('pending','old-token',1,'{}','[]','[]','date')")
        self.assertEqual(db.execute('SELECT editorial_threshold FROM editorial_controls').fetchone()[0], 50)
        db.execute("UPDATE editorial_controls SET editorial_threshold=60,policy_actor='owner' WHERE id=1")
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_preparations').fetchone()[0], 0)
        self.assertEqual(db.execute("SELECT previous_threshold,threshold,actor FROM editorial_policy_events WHERE actor='owner'").fetchone(), (50, 60, 'owner'))
        for sql in ['DELETE FROM editorial_policy_events', 'UPDATE editorial_policy_events SET threshold=90']:
            with self.assertRaises(sqlite3.IntegrityError): db.execute(sql)
        for invalid in [-1, 101]:
            with self.assertRaises(sqlite3.IntegrityError): db.execute('UPDATE editorial_controls SET editorial_threshold=?', (invalid,))

    def test_reconsidered_image_links_to_original_attempt_without_rewriting_history(self):
        db = database(); photo(db, 'source'); image(db, 'candidate', 'AI')
        checksum = db.execute("SELECT sha256 FROM images WHERE id='candidate'").fetchone()[0]
        dossier = json.dumps(dict(status='discarded', editorial_threshold=65, model='m', prompt='p', sha256=checksum, evaluation=dict(score=55)))
        db.execute("INSERT INTO editorial_attempts VALUES('generation','source',NULL,?,'date')", (dossier,))
        db.execute("UPDATE sources SET provider='openai-editorial',source_id='generation' WHERE id='candidate'")
        self.assertEqual(db.execute("SELECT image_id FROM editorial_attempt_images WHERE id='generation'").fetchone()[0], 'candidate')
        self.assertEqual(db.execute("SELECT image_id,dossier_json FROM editorial_attempts WHERE id='generation'").fetchone(), (None, dossier))
        db.execute("UPDATE images SET ai_prompt='different' WHERE id='candidate'")
        self.assertIsNone(db.execute("SELECT image_id FROM editorial_attempt_images WHERE id='generation'").fetchone()[0])
        with self.assertRaises(sqlite3.IntegrityError): db.execute("UPDATE editorial_attempts SET image_id='candidate'")


class ReconsiderTest(unittest.TestCase):
    def remote(self, reviewed=False, limit=100):
        def assessment(score): return dict(score=score, scores={key: score for key in AXES}, photographic=True, reason='Visible relation', concrete_motive='Specific relation', editorial_threshold=65)
        metadata = dict(provider='fixture', source_id='real', categories=['arte'])
        real = dict(id='real', role='REAL', rank=1, batch_id='lot', metadata_json=json.dumps(metadata), evaluation_json=json.dumps(assessment(60)), original_sha256='a'*64, file_sha256='b'*64)
        source = {**real, 'id':'source', 'role':'SLOP', 'rank':2, 'metadata_json':json.dumps({**metadata,'source_id':'source'}), 'evaluation_json':json.dumps(assessment(90))}
        record = dict(status='discarded', timestamp='2026-11-03T00:00:00Z', editorial_threshold=65, original_sha256='c'*64, sha256='d'*64, prompt='Original prompt', model='fixture', evaluation=assessment(50))
        attempt = dict(id='generation', reference_id='source', dossier_json=json.dumps(record), image_id=None)
        class Remote:
            base='https://example.invalid'; token='fixture'
            calls=[]
            def call(self, path, data=None):
                self.calls.append((path, data))
                if path=='controls': return dict(queue_limit=limit,editorial_threshold=50)
                if path=='state': return dict(editorial_threshold=50,references=[real,source],queue=dict(count=0),inventory=[dict(provider='fixture',source_id='real',status='approved'),dict(provider='openai-editorial',source_id='generation',status='rejected')] if reviewed else [])
                if path=='dossiers': return dict(attempts=[attempt])
                if path=='prepare': return dict(ready=True)
                if path=='reviews': return dict(saved=True)
                raise AssertionError('Unexpected call: '+path)
        return Remote(), attempt

    def test_plan_uses_current_threshold_keeps_roles_and_original_decision(self):
        remote, attempt = self.remote()
        original = attempt['dossier_json']
        result = reconsider(remote, 'lot', Path('/tmp/unused-reconsider'))
        self.assertEqual((result['real_eligible'], result['slop_eligible']), (1,1))
        self.assertFalse(result['remote_writes'])
        self.assertEqual(attempt['dossier_json'], original)
        self.assertTrue(all(data is None for _,data in remote.calls))

    def test_reconsider_reuses_archive_without_new_attempt_or_paid_call(self):
        remote, attempt = self.remote()
        original = attempt['dossier_json']
        with tempfile.TemporaryDirectory() as temp, patch.dict('os.environ',dict(GENERATED_LICENSE_NAME='CC BY 4.0',GENERATED_LICENSE_URL='https://creativecommons.org/licenses/by/4.0/')), patch('pipeline.reconsider.archive_file',return_value=Path(temp)/'file'), patch('pipeline.reconsider.prepare'), patch('pipeline.reconsider.upload',return_value=dict(id='candidate',status='in-review')) as upload, patch('pipeline.editorial.OpenAI') as paid:
            result = reconsider(remote,'lot',Path(temp),True)
            self.assertEqual(result['ready_for_review'],2)
            self.assertEqual(upload.call_count,2)
            paid.assert_not_called()
        self.assertEqual(attempt['dossier_json'],original)
        self.assertNotIn('attempts',[path for path,_ in remote.calls])
        self.assertNotIn('budget',[path for path,_ in remote.calls])

    def test_existing_human_approvals_and_rejections_are_preserved(self):
        remote,_=self.remote(reviewed=True)
        with tempfile.TemporaryDirectory() as temp, patch.dict('os.environ',dict(GENERATED_LICENSE_NAME='CC BY 4.0',GENERATED_LICENSE_URL='https://creativecommons.org/licenses/by/4.0/')), patch('pipeline.reconsider.upload') as upload:
            result=reconsider(remote,'lot',Path(temp),True)
            self.assertEqual(result['human_decisions_preserved'],2)
            upload.assert_not_called()


if __name__=='__main__': unittest.main()
