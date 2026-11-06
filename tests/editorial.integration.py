"""LOCAL Worker/D1/R2 editorial lifecycle, including competing publications."""
import concurrent.futures
import hashlib
import io
import json
import os
from pathlib import Path
import random
import subprocess
import urllib.error
import urllib.request
import uuid
from PIL import Image

base=os.environ['ROS_TEST_BASE']
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
prefix=uuid.uuid4().hex

def request(path,method='GET',data=None,auth=token):
    raw=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
    req=urllib.request.Request(base+path,method=method,data=raw,headers={'Authorization':'Bearer '+auth,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req) as res:
            raw=res.read()
            return res.status,json.loads(raw) if res.headers.get('Content-Type','').startswith('application/json') else raw
    except urllib.error.HTTPError as error:return error.code,json.loads(error.read())

for route in ['state','dossiers','controls','batch-runs']:
    assert request('/api/admin/editorial/'+route,auth='wrong')[0]==401
assert request('/api/admin/editorial/batch-runs','POST',{})[0]==503
assert request('/api/admin/editorial/budget','POST',dict(id='not-paid',run_id='not-paid',kind='evaluation'))[0]==503
assert request('/api/admin/editorial/publish','POST',dict(confirm=False))[0]==400

rng=random.Random(301)
photos=[];files={}
for n,role in enumerate(['REAL','SLOP']):
    image=Image.frombytes('RGB',(32,24),rng.randbytes(32*24*3));raw=io.BytesIO();image.save(raw,format='PNG');raw=raw.getvalue()
    files[role]=raw
    source_id=prefix+'-'+str(n)
    metadata=dict(provider='fixture-editorial',source_id=source_id,source_url='https://example.invalid/'+source_id,
        type='REAL',title='Private editorial source',description='Local fixture',author='Fixture author',evidence='Documented local fixture',
        explanation='Source reveal',categories=['arte'],license_url='https://creativecommons.org/publicdomain/zero/1.0/')
    photos.append(dict(id=source_id,role=role,rank=n+1,metadata=metadata,
        original_sha256=hashlib.sha256(raw).hexdigest(),file_sha256=hashlib.sha256(raw).hexdigest(),
        perceptual_hash=hashlib.sha256(source_id.encode()).hexdigest()[:16],evaluation=dict(score=90-n*70,reason='A specific visible fixture detail')))

payload=dict(batch_id=prefix,photos=photos)
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    statuses=list(pool.map(lambda _:request('/api/admin/editorial/references','POST',payload)[0],range(2)))
assert sorted(statuses)==[201,409],statuses
for photo in photos:
    for kind in ['original','preview']:
        assert request('/api/admin/editorial/references/'+photo['id']+'/'+kind,'PUT',files[photo['role']])[0]==200
        assert request('/api/admin/editorial/references/'+photo['id']+'/'+kind,auth='wrong')[0]==401
        assert request('/api/admin/editorial/references/'+photo['id']+'/'+kind)[1]==files[photo['role']]

# Registered SLOP material cannot enter REAL even through the ordinary importer.
assert request('/api/admin/import','POST',photos[1]['metadata'])[0]==409
photo=photos[0]
status,result=request('/api/admin/import','POST',{**photo['metadata'],'file_sha256':photo['file_sha256']})
assert status==201,result
real=result['id']
assert request('/api/admin/originals/'+real,'PUT',files['REAL'])[0]==200
assert request('/api/admin/assets/'+real,'PUT',files['REAL'])[0]==200
assert request('/api/admin/editorial/reviews','POST',dict(image_id=real,reference_id=photo['id']))[0]==200
# The score alone never approves; absent/blank notes do not prevent decisions.
waiting=request('/api/admin/images?status=in-review')[1]
assert next(row for row in waiting if row['id']==real)['status']=='in-review'
assert request('/api/admin/review/'+real,'POST',dict(decision='approved',rights_confirmed=True,authenticity_confirmed=True,notes='   '))[0]==200
approved=request('/api/admin/images?status=approved')[1]
assert next(row for row in approved if row['id']==real)['published_at'] is None
# Supply enough policy-compliant SLOP fixtures for the full waiting REAL pool.
# Earlier licence tests deliberately leave approved AI with other licences.
def sql(query):
    return json.loads(subprocess.check_output(['npx','wrangler','d1','execute','DB','--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE'],'--command',query,'--json'],stderr=subprocess.DEVNULL))[0]['results']
required=sql("SELECT count(*) AS n FROM images i WHERE i.type='REAL' AND i.demo=0 AND i.status='approved' AND NOT EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=i.id)")[0]['n']
for n in range(required):
    picture=Image.frombytes('RGB',(32,24),rng.randbytes(32*24*3));stream=io.BytesIO();picture.save(stream,'PNG');raw=stream.getvalue();fixture_id=prefix+'-ccby-'+str(n)
    metadata=dict(type='AI',title='CC BY publication fixture',description='Local fixture',author='Real or Slop',source_url='https://example.invalid/'+fixture_id,source_id=fixture_id,provider='local-fixture',license_url='https://creativecommons.org/licenses/by/4.0/',evidence='Synthetic local fixture',explanation='No real image or model call',categories=['arte'],ai_model='fixture',ai_prompt='Original fixture',owner_declaration=True,generation_date='2026-11-06')
    status,result=request('/api/admin/import','POST',metadata);assert status==201,result
    for kind in ['originals','assets']:assert request('/api/admin/'+kind+'/'+result['id'],'PUT',raw)[0]==200
    assert request('/api/admin/review/'+result['id'],'POST',dict(decision='approved',rights_confirmed=True,authenticity_confirmed=True))[0]==200
before=request('/api/admin/editorial/state')[1]['diagnostics']['totals']
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    outcomes=list(pool.map(lambda _:request('/api/admin/editorial/publish','POST',dict(confirm=True)),range(2)))
assert all(status==200 for status,_ in outcomes),outcomes
assert sum(result['published'] for _,result in outcomes)==1,outcomes
after=request('/api/admin/editorial/state')[1]['diagnostics']['totals']
for demo in (0,1):
    counts={row['type']:row['count'] for row in after if row['demo']==demo}
    assert counts.get('REAL',0)==counts.get('AI',0),counts
assert next(row for row in request('/api/admin/images?status=approved')[1] if row['id']==real)['published_at']
# Exercise the actual publication SQL: a legacy CC0 SLOP stays private even
# after an approval; attribution-required outputs need CC BY 4.0.
query="SELECT i.type,i.author,l.url FROM images i JOIN licenses l ON l.id=i.license_id JOIN published_images p ON p.image_id=i.id WHERE i.type='AI' AND i.demo=0"
rows=sql(query)
assert rows and all(r['url']=='https://creativecommons.org/licenses/by/4.0/' and r['author'].strip()for r in rows),rows
policy=request('/api/admin/editorial/state')[1]['diagnostics']['slop_license_policy']
assert policy['url']=='https://creativecommons.org/licenses/by/4.0/' and policy['blocked_waiting']>0,policy
# A refusal without a note remains possible and auditable.
metadata={**photos[0]['metadata'],'source_id':prefix+'-reject','source_url':'https://example.invalid/'+prefix+'-reject'}
status,result=request('/api/admin/import','POST',metadata);assert status==201,result
assert request('/api/admin/review/'+result['id'],'POST',dict(decision='rejected'))[0]==200
print('Editorial integration passed: private source archive, concurrent registry exclusion, human gates, optional notes, atomic concurrent 50/50 publication, private diagnostics, paid API disabled.')

# Discarded generated media remains private and visible without importing it.
attempt=prefix+'-discarded'
digest=hashlib.sha256(files['SLOP']).hexdigest()
record=dict(timestamp='2026-11-02T00:00:00Z',status='discarded',prompt='Independent fixture reinterpretation',model='fixture-generator',original_sha256=digest,sha256=digest,evaluation=dict(score=10,reason='Insufficient visible interest'))
assert request('/api/admin/import')[1]['attempt_media_archive'] is True
assert request('/api/admin/editorial/attempts','POST',dict(id=attempt,reference_id=photos[1]['id'],dossier=record))[0]==200
path='/api/admin/editorial/attempts/'+attempt
assert request(path+'/preview')[0]==404
for kind in ['original','preview']:
    assert request(path+'/'+kind,'PUT',files['SLOP'],auth='wrong')[0]==401
    assert request(path+'/'+kind,'PUT',b'wrong content')[0]==409
    assert request(path+'/'+kind,'PUT',files['SLOP'])[0]==200
    assert request(path+'/'+kind,'PUT',files['SLOP'])[0]==200
    assert request(path+'/'+kind,auth='wrong')[0]==401
    assert request(path+'/'+kind)[1]==files['SLOP']
entry=next(row for row in request('/api/admin/editorial/dossiers')[1]['attempts'] if row['id']==attempt)
assert entry['media_available']==1 and entry['image_id'] is None
assert request('/api/admin/editorial/state')[1]['diagnostics']['totals']==after
print('Discarded generation archive passed: private pixels, immutable checksums, idempotent uploads, Studio availability, no catalog import or publication.')
