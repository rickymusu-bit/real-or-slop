import hashlib
import contextlib
import io
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock,patch
from pipeline.editorial import Remote,PipelineStop,main,generate_slop,candidates,Budget
from editorial_pipeline_test import batch,config,Oracle

class AttemptMediaTest(unittest.TestCase):
    def test_discarded_generation_uploads_both_files_without_catalog_import(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);original=root/'attempt.png';preview=root/'attempt.webp'
            original.write_bytes(b'original');preview.write_bytes(b'preview')
            record=dict(id='attempt',reference_id='source',status='discarded',file=str(original),derived_file=str(preview),original_sha256=hashlib.sha256(original.read_bytes()).hexdigest(),sha256=hashlib.sha256(preview.read_bytes()).hexdigest())
            remote=Remote('https://example.invalid','x'*40,'run');remote.call=Mock()
            remote.save_attempt(record,root=root)
            calls=remote.call.call_args_list
            self.assertEqual([call.args[0] for call in calls],['attempts','attempts/attempt/original','attempts/attempt/preview'])
            self.assertIsNone(calls[0].args[1]['image_id'])
            self.assertEqual(calls[0].args[1]['dossier']['status'],'discarded')
            self.assertEqual(calls[1].args[1:],(b'original','PUT'))
            original.write_bytes(b'modified')
            with self.assertRaises(PipelineStop):remote.save_attempt(record,root=root)
            record['file']='/etc/passwd'
            with self.assertRaises(ValueError):remote.save_attempt(record,root=root)

    def test_migration_preserves_existing_tables_and_history(self):
        db=sqlite3.connect(':memory:')
        for file in sorted(Path('migrations').glob('*.sql')):
            if file.name<'0012':db.executescript(file.read_text())
        db.executescript(Path('scripts/seed.sql').read_text())
        names=[row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before={name:db.execute('SELECT * FROM '+name).fetchall() for name in names}
        db.executescript(Path('migrations/0012_editorial_attempt_media.sql').read_text())
        self.assertEqual(before,{name:db.execute('SELECT * FROM '+name).fetchall() for name in names})
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(db.execute('SELECT count(*) FROM editorial_attempt_media').fetchone()[0],0)

    def test_old_backend_is_rejected_before_any_paid_request(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);manifest=root/'manifest.json'
            import json
            manifest.write_text(json.dumps(batch(root,2)))
            env={'ENABLE_EDITORIAL_PAID':'true','OPENAI_API_KEY':'fixture','REAL_OR_SLOP_ADMIN_TOKEN':'x'*40,'GENERATED_LICENSE_NAME':'CC BY 4.0','GENERATED_LICENSE_URL':'https://creativecommons.org/licenses/by/4.0/'}
            with patch.dict('os.environ',env),patch('pipeline.editorial.Config.environment',return_value=config()),patch('pipeline.editorial.OpenAI') as api,patch('pipeline.editorial.Remote') as remote,patch('pipeline.editorial.request',return_value=dict(quarantine_configured=True,images_configured=True)),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(manifest),'--execute','--out',str(root/'out')]),1)
                api.return_value.vision.assert_not_called();api.return_value.generate.assert_not_called()
                remote.return_value.reserve.assert_not_called();remote.return_value.call.assert_not_called()

    def test_failure_after_generation_preserves_file_and_hash_for_archival(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);cfg=config();api=Oracle();vision=api.vision;saved=[]
            def evaluate(model,*args):
                if model==cfg.evaluator_model:raise PipelineStop('OpenAI HTTP 429')
                return vision(model,*args)
            api.vision=evaluate
            with self.assertRaises(PipelineStop):
                generate_slop(candidates(batch(root,1),root)[0],api,cfg,Budget(cfg),root,saved.append)
            self.assertEqual(saved[0]['status'],'error')
            self.assertEqual(hashlib.sha256(Path(saved[0]['file']).read_bytes()).hexdigest(),saved[0]['original_sha256'])
            self.assertTrue(Path(saved[0]['derived_file']).is_file())
