"""Private unified review: low scores, old refusals, independent approval and CAS."""
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
import sys
sys.path.insert(0, str(Path(__file__).parent))
import game_copy_helper

base=os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
def call(path, data=None, auth=token, method=None):
    req=urllib.request.Request(base+'/api/admin/'+path, method=method, data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization':'Bearer '+auth,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw=r.read();return r.status,json.loads(raw) if r.headers.get('Content-Type','').startswith('application/json') else raw
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
assert call('review-inbox',auth='wrong')[0]==401
assert call('review-inbox?offset=-1')[0]==400
assert call('review-inbox?state=invalid')[0]==400
rows=call('review-inbox')[1]['images']
assert any(x['details'].get('source_kind')=='attempt' and x['details'].get('previous_decision')=='discarded' for x in rows), rows
# No old preparation, model score or resolved license is required to SEE and
# express an owner preference about a new single image with no corresponding AI.
uid=uuid.uuid4().hex
raw=io.BytesIO();Image.new('RGB',(37,29),(17,31,79)).save(raw,format='PNG');raw=raw.getvalue();sha=hashlib.sha256(raw).hexdigest()
metadata=dict(type='REAL',title='Unpaired inbox fixture',description='Local only',author='Fixture',provider='inbox-fixture',
    source_id=uid,source_url='https://example.invalid/'+uid,evidence='Local test, rights unresolved',
    license_name='Da verificare',license_url='',explanation='Documentary review pending',categories=['arte'],file_sha256=sha)
status,result=call('import',metadata);assert status==201,result
image_id=result['id']
for kind in ('originals','assets'):
    req=urllib.request.Request(base+'/api/admin/'+kind+'/'+image_id,data=raw,method='PUT',headers={'Authorization':'Bearer '+token})
    with urllib.request.urlopen(req) as r:assert r.status==200
row=next(x for x in call('review-inbox')[1]['images'] if x['details'].get('source_id')==image_id)
assert row['partner'] is None
remove=dict(confirm_delete=True,revision=row['revision'],sha256=sha)
assert call('review-inbox/'+row['id'],remove,method='DELETE',auth='wrong')[0]==401
assert call('review-inbox/'+row['id'],remove,method='DELETE')[0]==409  # pending
assert call('review-inbox/'+row['id']+'/image',auth='wrong')[0]==401
assert call('review-inbox/'+row['id']+'/image')[1]==raw
payload=dict(decision='approved',sha256=sha,revision=row['revision'],note='Approved individually; rights remain unresolved.')
# Tags (spec lotti 1.4.2, section 4): a photo with only the `untagged` placeholder cannot be approved.
assert row['tags']==[]
assert row['id'] in [x['id'] for x in call('review-inbox?state=untagged')[1]['images']]
status,result=call('review-inbox/'+row['id']+'/decision',payload)
assert status==409 and 'untagged' in result['error'],(status,result)
tags='review-inbox/'+row['id']+'/tags'
assert call(tags,{'add':['steam-locomotive']},auth='wrong')[0]==401
for bad in (['Burning car'],['untagged'],['ai-generated'],['real'],['made-with-midjourney'],['x'*41],'flat',[1]):
    assert call(tags,{'add':bad})[0]==400,bad
status,result=call(tags,{'add':['Burning car']});assert 'burning-car' in result['error'],result
assert call(tags,{'add':['a'],'remove':['a']})[0]==400
assert call(tags,{})[0]==400
status,result=call(tags,{'add':['steam-locomotive','place-de-la-république','steam-locomotive']})
assert status==200 and result['tags']==['place-de-la-république','steam-locomotive'] and result['untagged'] is False,result
# The owner approves the uniform WebP game copy, not the original (docs/copie-di-gioco.v2.0.0.md).
status,result=call('review-inbox/'+row['id']+'/decision',payload)
assert status==409 and 'copia di gioco' in result['error'],(status,result)
copy_sha=game_copy_helper.prepare(base,token,row['id'],sha,raw)
assert call('review-inbox/'+row['id']+'/image')[1]!=raw
assert call('review-inbox/'+row['id']+'/decision',payload)[0]==409  # the original hash no longer matches
sha=copy_sha;payload['sha256']=sha;remove['sha256']=sha
assert call(tags)[1]['tags']==['place-de-la-république','steam-locomotive']
assert call(tags,{'add':['steam-locomotive']})[1]['tags']==['place-de-la-république','steam-locomotive']  # idempotent
assert row['id'] not in [x['id'] for x in call('review-inbox?state=untagged')[1]['images']]
listed=next(x for x in call('review-inbox')[1]['images'] if x['id']==row['id'])
assert listed['tags']==['place-de-la-république','steam-locomotive'],listed
vocabulary={t['label']:t for t in call('tags')[1]['tags']}
assert vocabulary['steam-locomotive']['photos']==1 and vocabulary['steam-locomotive']['source']=='owner'
assert call('tags',{'label':'Bad Label'})[0]==400
status,created=call('tags',{'label':'night'});assert status==201 and created['created'] is True
assert call('tags',{'label':'night'})[0]==200
assert call('review-inbox/'+row['id']+'/decision',{**payload,'sha256':'f'*64})[0]==409
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results=list(pool.map(lambda _:call('review-inbox/'+row['id']+'/decision',payload),range(2)))
assert sorted(status for status,_ in results)==[200,409],results
assert all(not result.get('published',False) for status,result in results)
assert row['id'] not in [x['id'] for x in call('review-inbox')[1]['images']]
assert next(x for x in call('images?status=in-review')[1] if x['id']==image_id)['status']=='in-review'
approved=next(x for x in call('review-inbox?state=approved')[1]['images'] if x['id']==row['id'])
assert approved['revision']==1
# Removing tags from the vocabulary: impact first, then an exact confirmation; history is kept.
place=vocabulary['place-de-la-république']['id'];locomotive=vocabulary['steam-locomotive']['id']
impact=call('tags/'+place+'/impact')[1]
assert impact['photos']==1 and impact['untagged_published']==0 and impact['untagged_unpublished']==0,impact
assert call('tags/'+place+'/retire',{'label':'other','expected_photos':1})[0]==400
assert call('tags/'+place+'/retire',{'label':'place-de-la-république','expected_photos':2})[0]==409
assert call('tags/'+place+'/retire',{'label':'place-de-la-république','expected_photos':1})[1]['retired'] is True
assert call('tags/'+place+'/impact')[0]==404
impact=call('tags/'+locomotive+'/impact')[1]
assert impact['untagged_unpublished']==1,impact   # its last tag: the approved photo would become untagged
assert call('tags/'+locomotive+'/retire',{'label':'steam-locomotive','expected_photos':1})[0]==200
assert call(tags)[1]['tags']==[]
assert row['id'] in [x['id'] for x in call('review-inbox?state=untagged')[1]['images']]  # approved, now untagged
assert call('tags')[1]['untagged']['photos']>=1
status,result=call(tags,{'add':['steam-locomotive']});assert status==200 and result['tags']==['steam-locomotive'],result  # label reusable after removal
assert len([t for t in call('tags')[1]['tags'] if t['label']=='steam-locomotive'])==1
assert call('review-inbox/'+row['id'],{**remove,'revision':1},method='DELETE')[0]==409  # approved
status,result=call('review-inbox/'+row['id']+'/decision',{**payload,'revision':1,'decision':'rejected','note':'Reconsidered.'})
assert status==200,result
# Syncing the old archives cannot overwrite the new human decision.
assert row['id'] not in [x['id'] for x in call('review-inbox')[1]['images']]
history=call('review-inbox/'+row['id']+'/history')[1]['events']
assert [r['decision'] for r in history]==['approved','rejected']
assert all(r['image_sha256']==sha for r in history)
assert len({x['sha256'] for x in call('review-inbox?origin=REAL&state=all')[1]['images']})==len(call('review-inbox?origin=REAL&state=all')[1]['images'])
# Deletion is explicit, exact-image-bound and limited to current rejections.
remove['revision']=2
assert call('review-inbox/'+row['id'],{**remove,'confirm_delete':False},method='DELETE')[0]==409
assert call('review-inbox/'+row['id'],{**remove,'sha256':'f'*64},method='DELETE')[0]==409
assert call('review-inbox/'+row['id'],{**remove,'revision':1},method='DELETE')[0]==409
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    deleted=list(pool.map(lambda _:call('review-inbox/'+row['id'],remove,method='DELETE'),range(2)))
assert sum(status==200 for status,_ in deleted)==1,deleted
assert all(status in (200,404,409) for status,_ in deleted)
for _ in range(2):
    # Reopening runs legacy synchronization; the image cannot come back.
    assert row['id'] not in [x['id'] for x in call('review-inbox?state=all')[1]['images']]
assert call('review-inbox/'+row['id']+'/image')[0]==404
assert call('assets/'+image_id)[1]==raw  # underlying historical dossier unchanged
print('Unified inbox passed: discarded pixels visible, unresolved rights visible, unpaired image approved privately, historical archives intact, CAS and append-only image-bound decisions.')
