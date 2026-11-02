"""LOCAL-only binary editorial review, preparation, feedback and concurrency."""
import concurrent.futures
import hashlib
import io
import json
import os
from pathlib import Path
import random
import urllib.error
import urllib.request
import uuid
from PIL import Image
base=os.environ['ROS_TEST_BASE'];token=Path('.dev.vars').read_text().strip().split('=',1)[1]

def request(path,method='GET',data=None,auth=token):
    raw=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
    req=urllib.request.Request(base+path,method=method,data=raw,headers={'Authorization':'Bearer '+auth,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req) as response:return response.status,json.loads(response.read())
    except urllib.error.HTTPError as error:return error.code,json.loads(error.read())

assert request('/api/admin/review-queue',auth='wrong')[0]==401
assert request('/api/admin/editorial/preferences',auth='wrong')[0]==401
prefix=uuid.uuid4().hex;rng=random.Random(prefix)
def png():
    output=io.BytesIO();Image.frombytes('RGB',(24,20),rng.randbytes(24*20*3)).save(output,format='PNG');return output.getvalue()
photos=[];raws=[]
for n,role in enumerate(['REAL','SLOP']):
    raw=png();raws.append(raw);uid=prefix+'-'+str(n)
    meta=dict(provider='fixture-review',source_id=uid,source_url='https://example.invalid/'+uid,type='REAL',title='Prepared photo',description='Documented scene',author='Fixture',evidence='Documented fixture evidence',explanation='Prepared explanation',categories=['arte'],license_url='https://creativecommons.org/publicdomain/zero/1.0/')
    score=90 if role=='REAL' else 20
    evaluation=dict(score=score,photographic=True,reason='Visible relationship',concrete_motive='Large sculpture',visual_tags=['large_scale'],editorial_threshold=65)
    photos.append(dict(id=uid,role=role,rank=n+1,metadata=meta,original_sha256=hashlib.sha256(raw).hexdigest(),file_sha256=hashlib.sha256(raw).hexdigest(),perceptual_hash=hashlib.sha256(uid.encode()).hexdigest()[:16],evaluation=evaluation))
assert request('/api/admin/editorial/references','POST',dict(batch_id=prefix,photos=photos))[0]==201
for photo,raw in zip(photos,raws):
    for kind in ['original','preview']:
        # Archive endpoint returns JSON for PUT, no data leaves the local Worker.
        assert request('/api/admin/editorial/references/'+photo['id']+'/'+kind,'PUT',raw)[0]==200
status,created=request('/api/admin/import','POST',{**photos[0]['metadata'],'file_sha256':photos[0]['file_sha256']});assert status==201,created
real=created['id']
assert request('/api/admin/visual-review/'+real,'POST',dict(decision='approved',token='forged'))[0]==409
assert real not in [row['id'] for row in request('/api/admin/review-queue')[1]['images']]
for endpoint in ['originals','assets']:
    assert request('/api/admin/'+endpoint+'/'+real,'PUT',raws[0])[0]==200
assert request('/api/admin/editorial/reviews','POST',dict(image_id=real,reference_id=photos[0]['id']))[0]==200
queue=request('/api/admin/review-queue')[1];card=next(row for row in queue['images'] if row['id']==real)
assert card['details']['explanation']=='Prepared explanation'
assert request('/api/admin/visual-review/'+real,'POST',dict(decision='approved',token='stale'))[0]==409
assert request('/api/admin/visual-review/'+real,'POST',dict(decision='approved',token=card['token'],explanation='Not the prepared facts'))[0]==400
before=request('/api/admin/editorial/preferences')[1]['observations']
# A file replacement invalidates the prepared card even when its bytes match.
assert request('/api/admin/assets/'+real,'PUT',raws[0])[0]==200
assert real not in [row['id'] for row in request('/api/admin/review-queue')[1]['images']]
assert request('/api/admin/editorial/prepare','POST',dict(image_id=real))[1]['ready']
card=next(row for row in request('/api/admin/review-queue')[1]['images'] if row['id']==real)
assert request('/api/admin/visual-review/'+real,'POST',dict(decision='approved',token=card['token']))[0]==200
assert request('/api/admin/visual-review/'+real,'POST',dict(decision='rejected',token=card['token']))[0]==409
approved=next(row for row in request('/api/admin/images?status=approved')[1] if row['id']==real)
assert approved['published_at'] is None
assert request('/api/admin/editorial/preferences')[1]['observations']==before+1

raw=png();sha=hashlib.sha256(raw).hexdigest();attempt_id=prefix+'-attempt'
meta=dict(type='AI',title='Generated scene',description='Independent synthetic scene',author='Fixture generator',provider='openai-editorial',source_id=attempt_id,source_url='https://openai.com/',license_url='https://creativecommons.org/licenses/by/4.0/',evidence='Synthetic provenance fixture',explanation='The scene is generated; a prepared observation.',categories=['arte'],ai_model='fixture-generator',ai_prompt='Open reinterpretation',generation_date='2026-11-02',owner_declaration=True,file_sha256=sha)
status,created=request('/api/admin/import','POST',meta);assert status==201,created
synthetic=created['id']
for endpoint in ['originals','assets']:assert request('/api/admin/'+endpoint+'/'+synthetic,'PUT',raw)[0]==200
keys=['subject','environment','objects_relations','materials','composition','situation','details','direct_observations','documented_information','inferences']
dossier=dict(timestamp='2026-11-02T00:00:00Z',status='accepted',prompt=meta['ai_prompt'],model=meta['ai_model'],sha256=sha,original_sha256=sha,creative_brief='An open independent scene',description={key:'Fixture '+key for key in keys},editorial_threshold=65,evaluation=dict(score=80,photographic=True,reason='A quiet scene',concrete_motive='Spatial relationship',visual_tags=['quiet_scene']))
payload=dict(id=attempt_id,reference_id=photos[1]['id'],image_id=synthetic,dossier=dossier)
assert request('/api/admin/editorial/attempts','POST',payload)[0]==200
assert request('/api/admin/editorial/attempts','POST',payload)[0]==200  # Lost response/retry keeps preparation.
card=next(row for row in request('/api/admin/review-queue')[1]['images'] if row['id']==synthetic)
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    statuses=list(pool.map(lambda _:request('/api/admin/visual-review/'+synthetic,'POST',dict(decision='rejected',token=card['token']))[0],range(2)))
assert sorted(statuses)==[200,409],statuses
learned=request('/api/admin/editorial/preferences')[1]
assert learned['observations']==before+2
assert learned['exploration']==.25
assert next(row for row in learned['counts'] if row['feature']=='visual:quiet_scene')['rejected']==1
assert next(row for row in learned['counts'] if row['feature']=='visual:large_scale')['approved']==1
assert not {real,synthetic}&{row['id'] for row in request('/api/admin/review-queue')[1]['images']}
print('Visual review passed: prepared pixels/provenance, no forms/notes/checkboxes, stale/forged/changed records blocked, manual approval without publication, atomic feedback, no repeated decisions, positive/negative learning and exploration.')
