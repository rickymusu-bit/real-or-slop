"""LOCAL standard-copy projection: real pixels, stale-review defense and deletion."""
import hashlib
import io
import json
import os
from pathlib import Path
import random
import subprocess
import tempfile
import urllib.request
import urllib.error
import uuid
from PIL import Image
base=os.environ['ROS_TEST_BASE'];assert base.startswith('http://127.0.0.1:')
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
def call(path,data=None,method=None):
 req=urllib.request.Request(base+'/api/admin/'+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req) as r:
   raw=r.read();return r.status,json.loads(raw) if r.headers.get('Content-Type','').startswith('application/json') else raw
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
uid=uuid.uuid4().hex
image=Image.frombytes('RGB',(160,100),random.Random(uid).randbytes(160*100*3))
stream=io.BytesIO();image.save(stream,'PNG');source=stream.getvalue();source_sha=hashlib.sha256(source).hexdigest()
metadata=dict(type='REAL',title='Presentation LOCAL fixture',description='Local only',author='Fixture',provider='presentation-fixture',source_id=uid,source_url='https://example.invalid/'+uid,
 evidence='Local test fixture',license_name='Pending',license_url='',explanation='Local source',categories=['arte'],file_sha256=source_sha)
status,result=call('import',metadata);assert status==201,result
source_id=result['id']
for kind in ('originals','assets'):
 req=urllib.request.Request(base+'/api/admin/'+kind+'/'+source_id,data=source,method='PUT',headers={'Authorization':'Bearer '+token})
 with urllib.request.urlopen(req) as r:assert r.status==200
row=next(r for r in call('review-inbox')[1]['images'] if r['details'].get('source_id')==source_id)
assert call('review-inbox/'+row['id']+'/decision',dict(decision='approved',revision=0,sha256=source_sha,note='Source approved'))[0]==200
stream=io.BytesIO();image.crop((30,0,130,100)).resize((1024,1024)).save(stream,'WEBP',quality=85);final=stream.getvalue();sha=hashlib.sha256(final).hexdigest()
profile=json.loads(Path('tests/editorial-v2-contract.json').read_text())['profile']
meta=dict(profile=profile,profile_image_sha256=sha,presentation=dict(width=1024,height=1024),normalization=dict(owner_requested=True,approved_source_sha256=source_sha,crop_decision=dict(preserves_context=True,needs_review=False)))
key='fixture-standard/'+uid
with tempfile.TemporaryDirectory() as temp:
 p=Path(temp);(p/'final.webp').write_bytes(final)
 args=['npx','wrangler','r2','object','put','real-or-slop-quarantine-local/'+key,'--file',str(p/'final.webp'),'--content-type','image/webp','--local','--persist-to',os.environ['ROS_TEST_STATE'],'--env','local']
 subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 q=lambda value:"'"+value.replace("'","''")+"'"
 values=[q(row['id']),q(source_sha),'1',q(sha),q(key),'1024','1024',q(json.dumps(meta)),q('date')]
 (p/'insert.sql').write_text('INSERT INTO editorial_review_presentations VALUES('+','.join(values)+');')
 subprocess.run(['npx','wrangler','d1','execute','DB','--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE'],'--file',str(p/'insert.sql')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
view=next(r for r in call('review-inbox?state=approved')[1]['images'] if r['id']==row['id'])
assert view['sha256']==sha and view['revision']==1
assert view['details']['profile_image_sha256']==sha
assert call('review-inbox/'+row['id']+'/image')[1]==final
assert call('assets/'+source_id)[1]==source
assert call('review-inbox/'+row['id']+'/decision',dict(decision='rejected',revision=1,sha256=source_sha,note='Stale frame'))[0]==409
assert call('review-inbox/'+row['id']+'/decision',dict(decision='rejected',revision=1,sha256=sha,note='Final frame reviewed'))[0]==200
history=call('review-inbox/'+row['id']+'/history')[1]['events']
assert [r['image_sha256'] for r in history]==[source_sha,sha]
assert call('review-inbox/'+row['id'],dict(confirm_delete=True,revision=2,sha256=sha),method='DELETE')[0]==200
assert call('review-inbox/'+row['id']+'/image')[0]==404
assert row['id'] not in [r['id'] for r in call('review-inbox?state=all')[1]['images']]
print('Standard presentation passed: final pixels served, source approval preserved, fresh profile attached, stale frame blocked, new review bound to crop, deletion prevents source resurrection.')
