import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError
from pipeline.batch_api import BatchAPI
from pipeline.batch_store import safe_path
from pipeline.editorial import PipelineStop

class Response(io.BytesIO):
    def __enter__(self):return self
    def __exit__(self,*args):self.close()

class BatchAPITest(unittest.TestCase):
    def test_native_files_and_batch_endpoints_keep_keys_out_of_payloads(self):
        calls=[]
        def transport(req,timeout):
            calls.append((req.full_url,req.data,req.headers))
            if req.full_url.endswith('/files'):return Response(b'{"id":"file-fixture"}')
            return Response(b'{"id":"batch-fixture","status":"validating"}')
        api=BatchAPI('PRIVATE_TEST_KEY',transport)
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'requests.jsonl';path.write_text('{}\n')
            uid=api.upload_jsonl(path);self.assertEqual(uid,'file-fixture')
        api.create_batch(uid,'/v1/images/generations',{'run_id':'fixture'})
        self.assertIn(b'name="purpose"',calls[0][1]);self.assertIn(b'\r\nbatch\r\n',calls[0][1])
        self.assertNotIn(b'PRIVATE_TEST_KEY',calls[0][1]);self.assertNotIn(b'PRIVATE_TEST_KEY',calls[1][1])
        body=json.loads(calls[1][1]);self.assertEqual(body['completion_window'],'24h')
        self.assertEqual(body['endpoint'],'/v1/images/generations')
        self.assertNotIn('image',body)

    def test_credentials_and_safe_errors_do_not_trigger_fallbacks(self):
        with self.assertRaises(PipelineStop):BatchAPI('')
        def bad(req,timeout):raise HTTPError(req.full_url,429,'PRIVATE_TEST_KEY',{},None)
        api=BatchAPI('PRIVATE_TEST_KEY',bad)
        with self.assertRaises(PipelineStop) as error:api.create_batch('file-id','/v1/responses',{})
        self.assertNotIn('PRIVATE_TEST_KEY',str(error.exception))
        with self.assertRaises(PipelineStop):api.retrieve('../../other')
        with self.assertRaises(PipelineStop):api.create_batch('file-id','/v1/images/edits',{})

    def test_streaming_files_and_path_validation(self):
        lines=b'{"custom_id":"two"}\n{"custom_id":"one"}\n'
        api=BatchAPI('test',lambda req,timeout:Response(lines))
        self.assertEqual([row['custom_id'] for row in api.lines('file-fixture')],['two','one'])
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for value in ['../secret','.env','inputs/id/../../.env','requests/id.jsonl','inputs/id/config.json']:
                with self.assertRaises(PipelineStop):safe_path(root,value)
            (root/'inputs/id').mkdir(parents=True);(root/'inputs/id/original.png').symlink_to('/tmp/no-source')
            with self.assertRaises(PipelineStop):safe_path(root,'inputs/id/original.png')

    def test_upload_denial_reports_status_without_upstream_secrets(self):
        def denied(req,timeout):raise HTTPError(req.full_url,401,'PRIVATE_TEST_KEY',{},None)
        api=BatchAPI('PRIVATE_TEST_KEY',denied)
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'requests.jsonl';path.write_text('{}\n')
            with self.assertRaises(PipelineStop) as error:api.upload_jsonl(path)
        self.assertIn('HTTP 401',str(error.exception))
        self.assertNotIn('PRIVATE_TEST_KEY',str(error.exception))
