"""Local HTTP integration; fixture embeddings, no network model inference."""
import concurrent.futures
import hashlib
import io
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
import uuid
from PIL import Image

base = os.environ['ROS_TEST_BASE']
assert base.startswith('http://127.0.0.1:')
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
model = 'dinov2-small-q8-cls-v1'


def call(path, data=None, method=None, auth=token):
    req = urllib.request.Request(base+'/api/admin/'+path, method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization': 'Bearer '+auth, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def create(index, origin='REAL'):
    uid = uuid.uuid4().hex
    buf = io.BytesIO()
    Image.new('RGB', (47+index, 41), (53+index, 79, 91)).save(buf, format='PNG')
    raw = buf.getvalue()
    sha = hashlib.sha256(raw).hexdigest()
    status, result = call('import', dict(type=origin, title='Similarity fixture '+str(index), description='Local fixture',
        author='Fixture', provider='similarity-fixture', source_id=uid, source_url='https://example.invalid/'+uid,
        evidence='Local only', license_name='Da verificare', license_url='', explanation='Local fixture', categories=['arte'], file_sha256=sha,
        **(dict(ai_model='fixture', ai_prompt='Local synthetic fixture', generation_date='2026-11-05', owner_declaration=True) if origin == 'AI' else {})))
    assert status == 201, result
    req = urllib.request.Request(base+'/api/admin/assets/'+result['id'], data=raw, method='PUT', headers={'Authorization': 'Bearer '+token})
    with urllib.request.urlopen(req) as response: assert response.status == 200
    return result['id'], sha


assert call('similarity', auth='wrong')[0] == 401
created = [create(i) for i in range(3)]
assert call('similarity')[0] == 200
assets = call('similarity/assets?category=arte')[1]['assets']
rows = [next(a for a in assets if a['id'] == 'image-'+uid) for uid, sha in created]
assert all(not row['indexed'] for row in rows)
assert all('arte' in row['categories'] for row in rows)
vectors = [[1, 0], [0.96, 0.2], [0, 1]]
hashes = ['0000000000000000', 'ffffffffffffffff', 'a5a5a5a5a5a5a5a5']
for row, vector, dhash in zip(rows, vectors, hashes):
    payload = dict(sha256=row['sha256'], model=model, dhash=dhash, embedding=vector+[0]*382)
    endpoint = 'similarity/assets/'+row['id']+'/features'
    assert call(endpoint, {**payload, 'sha256': 'f'*64})[0] == 409
    assert call(endpoint, {**payload, 'embedding': [0]*384})[0] == 400
    assert call(endpoint, payload)[0] == 200
    # Reusing the exact cached model does not need another image upload.
    assert call(endpoint, dict(sha256=row['sha256'], model=model))[0] == 200
all_pairs = call('similarity/pairs?decision=all&category=arte')[1]['pairs']
pair = next(p for p in all_pairs if {p['a'], p['b']} == {rows[0]['id'], rows[1]['id']})
assert pair['reason'] == 'visual' and pair['decision'] == 'pending'
assert not any(rows[2]['id'] in (p['a'], p['b']) for p in all_pairs)
assert call('similarity/pairs?decision=all&offset=-1')[0] == 400
assert call('similarity/assets/'+rows[0]['id']+'/categories', dict(sha256=rows[0]['sha256'], categories=['missing']))[0] == 400
assert call('similarity/assets/'+rows[0]['id']+'/categories', dict(sha256=rows[0]['sha256'], categories=['arte', 'storia']))[0] == 200
decision = dict(decision='same_scene', revision=pair['revision'], a_sha256=pair['a_sha256'], b_sha256=pair['b_sha256'], note='Same place, different perspective')
endpoint = 'similarity/pairs/'+pair['id']+'/decision'
assert call(endpoint, {**decision, 'a_sha256': 'f'*64})[0] == 409
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results = list(pool.map(lambda _: call(endpoint, decision), range(2)))
assert sorted(s for s, _ in results) == [200, 409], results
# Repeated indexing must never erase the human choice.
assert call('similarity/assets/'+rows[0]['id']+'/features', dict(sha256=rows[0]['sha256'], model=model))[0] == 200
history = call('similarity/pairs/'+pair['id']+'/history')[1]['events']
assert len(history) == 1 and history[0]['decision'] == 'same_scene'
assert call(endpoint, {**decision, 'decision': 'different', 'revision': 1})[0] == 200
assert len(call('similarity/pairs/'+pair['id']+'/history')[1]['events']) == 2
# Human recall path: create a pair the model did not suggest.
status, manual = call('similarity/pairs', dict(a=rows[0]['id'], b=rows[2]['id']))
assert status == 200
assert call('similarity/pairs', dict(a=rows[0]['id'], b=rows[0]['id']))[0] == 400
assert next(p for p in call('similarity/pairs?decision=all')[1]['pairs'] if p['id'] == manual['id'])['reason'] == 'manual'
ai_created = [create(i, 'AI') for i in (3, 4)]
call('similarity')
ai_assets = call('similarity/assets?origin=AI')[1]['assets']
ai_rows = [next(a for a in ai_assets if a['id'] == 'image-'+uid) for uid, sha in ai_created]
assert all(a['origin'] == 'AI' for a in ai_assets)
for row, vector, dhash in zip(ai_rows, [[1, 0], [0.96, 0.2]], hashes[:2]):
    assert call('similarity/assets/'+row['id']+'/features', dict(sha256=row['sha256'], model=model, dhash=dhash, embedding=vector+[0]*382))[0] == 200
# These AI vectors/hashes deliberately match the REAL fixtures. No cross pair
# may be produced or manually created, even with a perfect visual score.
all_pairs = call('similarity/pairs?decision=all')[1]['pairs']
assert all(p['left']['origin'] == p['right']['origin'] for p in all_pairs)
assert any({p['a'],p['b']} == {ai_rows[0]['id'],ai_rows[1]['id']} for p in all_pairs)
assert call('similarity/pairs', dict(a=rows[0]['id'], b=ai_rows[0]['id']))[0] == 400
assert all(p['left']['origin'] == p['right']['origin'] == 'AI' for p in call('similarity/pairs?decision=all&origin=AI')[1]['pairs'])
assert all(p['left']['origin'] == p['right']['origin'] == 'REAL' for p in call('similarity/pairs?decision=all&origin=REAL')[1]['pairs'])
assert call('similarity/pairs?origin=invalid')[0] == 400
assert call('similarity/assets?origin=invalid')[0] == 400
assert call('similarity')[1]['comparison_scope'] == 'same_origin'
print('Similarity HTTP passed: same-origin automatic/manual comparisons, separate REAL/SLOP filters, auth, exact hash binding, incremental retries, concurrent decisions and preserved history.')
