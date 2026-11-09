"""LOCAL canonical inbox -> owner votes -> rights admission -> balanced game pool."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid

sys.path.insert(0,str(Path('.').resolve()))
from pipeline.real.inbox import helpers
from pipeline.v2.fixtures import picture

base=os.environ['ROS_TEST_BASE'];assert base.startswith('http://127.0.0.1:')
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
cycle='cycle-'+uuid.uuid4().hex
route='/api/admin/editorial/cycle'

def call(path,data=None,auth=token):
    req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization':'Bearer '+auth,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw=r.read();return r.status,json.loads(raw) if r.headers.get('Content-Type','').startswith('application/json') else raw
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read())

def sql(command):
    args=['npx','wrangler','d1','execute','DB','--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE'],'--command',command,'--json']
    return json.loads(subprocess.check_output(args,stderr=subprocess.DEVNULL))[0]['results']

def literal(value):return 'NULL' if value is None else "'"+str(value).replace("'","''")+"'"

assert call(route+'?cycle_id='+cycle,auth='wrong')[0]==401
assert call(route+'/admit',{})[0]==400
assert call(route+'/publish',dict(cycle_id=cycle,confirm=False))[0]==400
before=sql("SELECT i.demo,i.type,count(*) AS n FROM images i JOIN published_images p ON p.image_id=i.id GROUP BY i.demo,i.type")
with tempfile.TemporaryDirectory() as folder:
    root=Path(folder);images=[]
    for i,origin in enumerate(['REAL']*3+['AI']*3):
        raw=picture(random.Random(cycle).randint(100,100000)+i,(48,48));path=root/(str(i)+'.png');path.write_bytes(raw)
        sha=hashlib.sha256(raw).hexdigest();uid=cycle+'-'+str(i)
        proof=dict(input_kind='text-only',fully_synthetic=True,freeze_sha256='a'*64,request_id='fixture-'+str(i),
            generated_at='2026-11-06T22:00:00Z',model='fixture-image',prompt='A frozen fully synthetic photographic scene.') if origin=='AI' else dict(kind='REAL')
        images.append(dict(id=uid,origin=origin,sha256=sha,file=str(path),original_file=str(path),created_at='2026-11-06T22:00:00Z',
            metadata=dict(title='Local cycle fixture',author='Fixture',source_url='https://example.invalid/'+uid,
                          license_url='https://creativecommons.org/publicdomain/zero/1.0/',cycle_id=cycle,provenance=proof)))
    rows,files=helpers.prepare(dict(version='1.0.0',images=images),root)
    for info in files.values():
        subprocess.run(['npx','wrangler','r2','object','put','real-or-slop-quarantine-local/'+info['key'],
            '--file',info['path'],'--content-type',info['mime'],'--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE']],
            check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    sql('INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,pair_key,created_at) VALUES '+
        ','.join('('+','.join(literal(v) for v in row)+')' for row in rows))

    def admission(index,revision=1):
        image=images[index]
        return dict(cycle_id=cycle,inbox_id=image['id'],revision=revision,sha256=image['sha256'],
            rights_confirmed=True,authenticity_confirmed=True,title='Local cycle fixture',author='Fixture',
            source_url=image['metadata']['source_url'],license_url=image['metadata']['license_url'],
            evidence='LOCAL synthetic fixture: owner independently checked origin and rights.',
            explanation='A fully synthetic local test, not a factual provenance claim.',categories=['arte'],
            **(dict(owner_declaration=True) if image['origin']=='AI' else {}))
    def vote(index,decision,revision=0,**kwargs):
        image=images[index]
        if decision=='approved':  # approval needs at least one tag (spec lotti 1.4.2)
            assert call('/api/admin/review-inbox/'+image['id']+'/tags',dict(add=['fixture-scene']))[0]==200
        return call('/api/admin/review-inbox/'+image['id']+'/decision',dict(decision=decision,sha256=image['sha256'],revision=revision,note='LOCAL fixture vote',**kwargs))

    assert call(route+'/admit',admission(0))[0]==409  # No owner approval.
    for i in range(5):assert vote(i,'approved')[0]==200
    assert vote(5,'rejected',reason='generation')[0]==200
    def upload_copy(image_id,raw,mime='image/webp'):
        req=urllib.request.Request(base+route+'/game-copy?image_id='+image_id,data=raw,method='POST',
            headers={'Authorization':'Bearer '+token,'Content-Type':mime})
        try:
            with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read())
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    def encoded(index,size=None,fmt='WEBP'):
        # Stand-in for the browser encoder (src/game-copy.v1.0.0.ts): same recipe, fixture-sized.
        from io import BytesIO
        from PIL import Image
        picture_=Image.open(images[index]['file']).convert('RGB')
        if size:picture_=picture_.resize(size)
        out=BytesIO();picture_.save(out,fmt,quality=85);return out.getvalue()
    def prepare_missing():
        missing=call(route+'?cycle_id='+cycle)[1]['missing_game_copies']
        for item in missing:
            index=next(i for i,image in enumerate(images) if image['id']==item['inbox_id'])
            status,data=upload_copy(item['image_id'],encoded(index));assert status==201,(status,data)
        return missing
    assert call(route+'/admit',{**admission(0),'rights_confirmed':False})[0]==400
    assert call(route+'/admit',{**admission(0),'categories':['missing']})[0]==400
    assert call(route+'/admit',{**admission(0),'sha256':'f'*64})[0]==409
    assert call(route+'/admit',admission(5))[0]==409
    assert sql('SELECT count(*) AS n FROM editorial_cycle_admissions')[0]['n']==0
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda _:call(route+'/admit',admission(0)),range(2)))
    assert sorted(x[0] for x in results)==[200,201],results
    for i in range(1,5):
        status,data=call(route+'/admit',admission(i));assert status==201,(status,data)
    assert call(route+'/admit',admission(0))[1]['already_admitted'] is True
    assert call(route+'/admit',{**admission(0),'evidence':'Changed documentary attestation'})[0]==409
    # Revoking after admission prevents BOTH cycle and legacy publisher paths.
    assert vote(4,'rejected',revision=1)[0]==200
    state=call(route+'?cycle_id='+cycle)[1]
    assert {r['type']:r['count'] for r in state['ready']}=={'AI':1,'REAL':3},state
    # Publication waits for the uniform WebP game copies (docs/copie-di-gioco.v1.0.0.md).
    assert len(state['missing_game_copies'])==4,state
    assert call(route+'/publish',dict(cycle_id=cycle,confirm=True))[1]['published'] is False
    first=state['missing_game_copies'][0]
    first_index=next(i for i,image in enumerate(images) if image['id']==first['inbox_id'])
    assert upload_copy(first['image_id'],encoded(first_index,(40,48)))[0]==409  # dimensions differ from the admitted file
    assert upload_copy(first['image_id'],encoded(first_index,fmt='PNG'),'image/png')[0]==415
    assert upload_copy(first['image_id'],b'not an image')[0]==415
    assert upload_copy('missing-image',encoded(first_index))[0]==404
    assert upload_copy(first['image_id'],b'x'*4_000_001)[0]==413
    assert len(prepare_missing())==4
    assert call(route+'?cycle_id='+cycle)[1]['missing_game_copies']==[]
    repeat=upload_copy(first['image_id'],encoded(first_index))
    assert repeat[0]==200 and repeat[1]['already_prepared'] is True,repeat
    copies=sql("SELECT image_id,mime,width,height,recipe FROM editorial_game_copies")
    assert all(c['mime']=='image/webp' and (c['width'],c['height'])==(48,48) and c['recipe'].startswith('webp-q0.85') for c in copies),copies
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        publications=list(pool.map(lambda _:call(route+'/publish',dict(cycle_id=cycle,confirm=True)),range(2)))
    assert all(x[0]==200 for x in publications),publications
    assert sorted(x[1]['per_origin'] for x in publications)==[0,1],publications
    assert sql("SELECT count(*) AS n FROM published_images p JOIN editorial_cycle_admissions a ON a.image_id=p.image_id WHERE a.cycle_id="+literal(cycle))[0]['n']==2
    assert call('/api/admin/editorial/publish',dict(confirm=True))[0]==200
    assert sql("SELECT count(*) AS n FROM published_images p JOIN editorial_cycle_admissions a ON a.image_id=p.image_id WHERE a.cycle_id="+literal(cycle))[0]['n']==2
    # Approving again requires a fresh documentary admission of the new vote.
    assert vote(4,'approved',revision=2)[0]==200
    assert call(route+'/admit',admission(4,3))[0]==201
    prepare_missing()
    assert call(route+'/publish',dict(cycle_id=cycle,confirm=True))[1]['per_origin']==1
    assert call(route+'/publish',dict(cycle_id=cycle,confirm=True))[1]['published'] is False
    assert sql("SELECT count(*) AS n FROM editorial_cycle_ready_images r WHERE r.cycle_id="+literal(cycle)+" AND NOT EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=r.image_id)")[0]['n']==1
    # Published review/identity cannot change silently. Original and displayed bytes persist.
    published=sql("SELECT r.inbox_id,q.revision,r.image_id FROM editorial_cycle_ready_images r JOIN published_images p ON p.image_id=r.image_id JOIN editorial_review_effective_images q ON q.id=r.inbox_id WHERE r.cycle_id="+literal(cycle))[0]
    published_index=next(i for i,image in enumerate(images) if image['id']==published['inbox_id'])
    assert vote(published_index,'rejected',revision=published['revision'])[0]==409
    status,replayed=call(route+'/admit',admission(published_index,published['revision']))
    assert status==200 and replayed['already_admitted'] and replayed['published'],(status,replayed)
    admitted=replayed['image_id'];assert admitted==published['image_id']
    assert call('/api/admin/originals/'+admitted)[1]==Path(images[published_index]['file']).read_bytes()
    assert call('/api/admin/assets/'+admitted)[1]==Path(images[published_index]['file']).read_bytes()
    totals=sql("SELECT i.type,count(*) AS n FROM images i JOIN published_images p ON p.image_id=i.id WHERE i.demo=0 GROUP BY i.type")
    assert len({r['n'] for r in totals})==1,totals
    assert len(sql("SELECT * FROM editorial_review_inbox_events WHERE image_id="+literal(images[4]['id'])))==3
    assert sql("SELECT count(*) AS n FROM editorial_review_inbox WHERE id="+literal(images[5]['id']))[0]['n']==1
print('Editorial cycle passed: pending inbox, pixel-bound site votes, separate rights, idempotent concurrent admission, revoked votes, two balanced publications, surplus REAL retained, originals and refusals preserved.')
