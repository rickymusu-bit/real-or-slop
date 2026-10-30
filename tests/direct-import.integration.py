"""Direct D1/R2 import, retry and private originals against LOCAL emulators."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid
from PIL import Image

base = os.environ['ROS_TEST_BASE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
def request(path, method='GET', data=None, auth=token):
    raw = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(base+path, method=method, data=raw,
                                 headers={'Authorization': 'Bearer '+auth, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            raw = response.read()
            return response.status, json.loads(raw) if response.headers.get('Content-Type', '').startswith('application/json') else raw
    except urllib.error.HTTPError as error:
        return error.code, error.read()

assert request('/api/admin/import', auth='wrong')[0] == 401
assert request('/api/admin/import')[1]['quarantine_configured'] is True
with tempfile.TemporaryDirectory(dir='.wrangler') as folder:
    root = Path(folder).resolve()
    original = root / 'source.png'
    Image.frombytes('RGB', (2, 2), uuid.uuid4().bytes[:12]).save(original)
    data = original.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    uid = uuid.uuid4().hex
    meta = dict(type='REAL', title='Direct import fixture', author='Local test', provider='direct-fixture', source_id=uid,
                source_url='https://example.invalid/direct/'+uid, evidence='Synthetic fixture only', categories=['arte'],
                license_url='https://creativecommons.org/licenses/by-nc-nd/4.0/', explanation='Private fixture', difficulty='medio')
    payload = {**meta, 'file_sha256': sha}
    # A successful POST followed by an interrupted uploader must be recoverable.
    status, imported = request('/api/admin/import', 'POST', payload)
    assert status == 201, imported
    image_id = imported['id']
    assert request('/api/admin/import', 'POST', payload)[1]['id'] == image_id
    assert request('/api/admin/import', 'POST', {**payload, 'file_sha256': 'invalid'})[0] == 400
    manifest = root / 'manifest.json'
    manifest.write_text(json.dumps([dict(metadata=meta, file=str(original), sha256=sha)]))
    command = ['python3', 'scripts/import-queue.py', str(manifest), '--base', base, '--apply']
    env = {**os.environ, 'REAL_OR_SLOP_ADMIN_TOKEN': token}
    for _ in range(2):
        subprocess.run(command, env=env, check=True, stdout=subprocess.DEVNULL)
        receipt = json.loads((root/'import-receipt.json').read_text())
        assert receipt['items'][0]['id'] == image_id
        assert receipt['items'][0]['original_sha256'] == sha
        assert receipt['items'][0]['status'] == 'in-review'
    replay = request('/api/admin/import', 'POST', payload)[1]
    assert replay['uploaded'] is True and replay['original_sha256'] == sha
    assert request('/api/admin/originals/'+image_id)[1] == data
    assert request('/api/admin/assets/'+image_id)[1] == data
    assert request('/api/admin/originals/'+image_id, auth='wrong')[0] == 401
    assert request('/api/media/originals/'+image_id, auth='')[0] == 404
    assert request('/api/admin/import', 'POST', {**payload, 'file_sha256': '0'*64})[0] == 409
    assert request('/api/admin/import', 'POST', {**payload, 'source_url': meta['source_url']+'/different'})[0] == 409
    assert request('/api/admin/import', 'POST', {**payload, 'type': 'AI', 'owner_declaration': True, 'ai_model': 'test', 'ai_prompt': 'fixture', 'generation_date': '2026-10-30'})[0] == 409
    assert request('/api/admin/import', 'POST', {**payload, 'source_id': uid+'-duplicate'})[0] == 409
    other = root / 'other.png'
    Image.frombytes('RGB', (2, 2), uuid.uuid4().bytes[:12]).save(other)
    assert request('/api/admin/originals/'+image_id, 'PUT', other.read_bytes())[0] == 409
    assert request('/api/admin/review/'+image_id, 'POST', dict(decision='approved', notes='Missing confirmation'))[0] == 400
    assert request('/api/admin/review/'+image_id, 'POST', dict(decision='approved', notes='Local fixture verified',
                   rights_confirmed=True, authenticity_confirmed=True))[0] == 200
    subprocess.run(command, env=env, check=True, stdout=subprocess.DEVNULL)
    assert json.loads((root/'import-receipt.json').read_text())['items'][0]['status'] == 'approved'
    assert request('/api/admin/originals/'+image_id)[1] == data
    assert request('/api/admin/originals/'+image_id, 'PUT', data)[0] == 409
    # Concurrent attempts cannot replace a newly archived original with another
    # image between the HEAD check and the conditional R2 write.
    import concurrent.futures
    other_bytes = other.read_bytes()
    race_payload = {**payload, 'source_id': uid+'-race', 'file_sha256': hashlib.sha256(other_bytes).hexdigest()}
    status, race = request('/api/admin/import', 'POST', race_payload)
    assert status == 201, race
    with concurrent.futures.ThreadPoolExecutor(2) as executor:
        outcomes = list(executor.map(lambda body: request('/api/admin/originals/'+race['id'], 'PUT', body)[0], [data, other_bytes]))
    assert sorted(outcomes) == [200, 409], outcomes
    assert request('/api/admin/originals/'+race['id'])[1] in (data, other_bytes)
print('Direct import passed: interrupted upload recovery, repeat without duplicates, immutable private R2 originals, manual approval and safe retry after approval; no Drive.')
