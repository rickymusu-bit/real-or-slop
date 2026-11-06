"""v4 private matrix + caption lifecycle against isolated LOCAL D1/R2 only."""
import copy
import concurrent.futures
import hashlib
import http.cookiejar
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid
from PIL import Image
from pipeline.v2.matrix_v4_0_0 import freeze

base=os.environ['ROS_TEST_BASE'];assert base.startswith('http://127.0.0.1:')
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(path,data=None,auth=token,method=None,headers=None):
    raw=data if isinstance(data,bytes)else json.dumps(data).encode()if data is not None else None
    request=urllib.request.Request(base+path,data=raw,method=method,headers={'Authorization':'Bearer '+auth,'Content-Type':'application/json',**(headers or {})})
    try:
        with client.open(request)as r:
            raw=r.read();return r.status,json.loads(raw)if r.headers.get('Content-Type','').startswith('application/json')else raw
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def sql(command,ok=True):
    with tempfile.NamedTemporaryFile(mode='w',suffix='.sql',delete=False)as file:file.write(command);path=file.name
    try:
        result=subprocess.run(['npx','wrangler','d1','execute','DB','--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE'],'--file',path,'--json'],capture_output=True,text=True)
        if ok:assert result.returncode==0,result.stderr;return json.loads(result.stdout)[0]['results']
        assert result.returncode!=0,'Expected a database gate to refuse this operation'
    finally:Path(path).unlink()
def q(s):return "'"+str(s).replace("'","''")+"'"
endpoint='/api/admin/editorial/matrix'
assert call(endpoint,auth='wrong')[0]==401
assert call('/admin/variety',auth='wrong')[0]==401
assert call(endpoint+'?emotion=unknown')[0]==400
status,empty=call(endpoint);assert status==200,empty;assert len(empty['cells'])==144
uid=uuid.uuid4().hex
with tempfile.TemporaryDirectory()as tmp:
    freeze(Path(tmp),count=1,cycle_id='matrix-'+uid,image_model='fixture-image',evaluator_model='fixture-vision')
    envelope=json.loads((Path(tmp)/'briefs.v4.0.0.json').read_text())['briefs'][0]
with concurrent.futures.ThreadPoolExecutor(2)as pool:
    assert [r[0]for r in pool.map(lambda _:call(endpoint+'/briefs',envelope),range(2))]==[200,200]
assert envelope['brief']['catalog']['version']=='4.3.0'
assert len(envelope['brief']['slop_prompt'])>2000
assert 'photography' in envelope['brief']
changed=copy.deepcopy(envelope);changed['brief']['photography']['profile']['iso_max']=999999
assert call(endpoint+'/briefs',changed)[0]==400
changed=copy.deepcopy(envelope);changed['brief']['slop_prompt']+=' changed';assert call(endpoint+'/briefs',changed)[0]==400
brief=envelope['brief'];cell=brief['intent_emotion']+':'+brief['intent_topic'];rows=[]
contract=json.loads(Path('tests/editorial-v2-contract.json').read_text())
# A started retrieval and its result are separate immutable events. Model costs
# and receipts must not turn into extra retrievals or duplicate booked expense.
def attempt(event_id,stage,cost,hits=0,eligible=0):
    return dict(id=event_id,kind='attempt',origin='REAL',intent_cell=cell,observed_cell=cell,candidate_id=None,image_sha256=None,brief_id=brief['brief_id'],revision=0,decision=None,provider='matrix-fixture',batch=uid,created_at=envelope['frozen_at'],data=dict(stage=stage,cost=cost,source_hits=hits,documentary_eligible=eligible,duplicates=0,queries=['fixture query']))
for event in [attempt('search-'+uid,'search',.02),attempt('result-'+uid,'search_result',0,3,1),attempt('profile-'+uid,'profile',.01),attempt('receipt-'+uid,'receipt',0)]:
    payload=dict(brief_ref=envelope['id'],event=event)
    with concurrent.futures.ThreadPoolExecutor(2)as pool:
        outcomes=list(pool.map(lambda _:call(endpoint+'/attempts',payload),range(2)));assert [r[0]for r in outcomes]==[200,200],outcomes
    changed=copy.deepcopy(payload);changed['event']['data']['cost']+=1
    assert call(endpoint+'/attempts',changed)[0]==400

for index,origin in enumerate(['REAL','AI']):
    raw=io.BytesIO();Image.new('RGB',(41,31),(29+index,47,83)).save(raw,'PNG');raw=raw.getvalue();sha=hashlib.sha256(raw).hexdigest();candidate='matrix-'+uid+'-'+origin.lower()
    metadata=dict(type=origin,title='Local matrix fixture',description='Isolated integration pixels',author='Fixture',provider='matrix-fixture',source_id=candidate,source_url='https://example.invalid/'+candidate,license_name='CC0',license_url='https://creativecommons.org/publicdomain/zero/1.0/',evidence='Synthetic test receipt, not authentic photographic evidence',explanation='Isolated test only',categories=['arte'],file_sha256=sha)
    if origin=='AI':metadata.update(ai_model='fixture-image',ai_prompt='Original isolated fixture',generation_date='2026-11-05',owner_declaration=True)
    status,result=call('/api/admin/import',metadata);assert status==201,result;image_id=result['id']
    for kind in ['originals','assets']:assert call('/api/admin/'+kind+'/'+image_id,raw,method='PUT')[0]==200
    proof=copy.deepcopy(contract['real_provenance'if origin=='REAL'else'synchronous_provenance'])
    proof['license_url']=metadata['license_url']
    if origin=='AI':proof.update(idea_id=brief['brief_id'],idea=brief['description'],prompt=brief['slop_prompt'],model=brief['parameters']['image_model'],parameters=dict(n=1,size=brief['parameters']['size'],quality=brief['parameters']['quality']),generated_at=envelope['frozen_at'])
    if origin=='REAL':proof.update(provider='matrix-fixture',source_id=candidate,source_url=metadata['source_url'],authenticity='verified',content_kind='artwork')
    dossier=json.dumps(dict(title='Local matrix fixture',provenance=proof))
    key=sql('SELECT r2_key FROM images WHERE id='+q(image_id))[0]['r2_key']
    sql('INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES('+','.join(map(q,[candidate,origin,sha,key,dossier,envelope['frozen_at']]))+')')
    link=dict(candidate_id=candidate,image_sha256=sha,brief_ref=envelope['id'],observed_cell=cell,provider='matrix-fixture',batch=uid)
    with concurrent.futures.ThreadPoolExecutor(2)as pool:
        outcomes=list(pool.map(lambda _:call(endpoint+'/candidates',link),range(2)));assert [r[0]for r in outcomes]==[200,200],outcomes
    assert call(endpoint+'/candidates',link)[0]==200
    status,alias=call(endpoint+'/candidates',{**link,'candidate_id':'alias-'+candidate,'origin':origin});assert status==200 and alias['candidate_id']==candidate,alias
    assert call(endpoint+'/candidates',{**link,'image_sha256':'f'*64})[0]==400
    assert call('/api/admin/review-inbox/'+candidate+'/decision',dict(sha256=sha,revision=0,decision='approved'))[0]==200 # note absent
    assert call(endpoint+'/candidates/'+candidate+'/game-binding',dict(image_sha256=sha,image_id=image_id))[0]==200
    caption=dict(game_caption='Una stanza di lavoro con un tavolo, scaffali e oggetti di uso quotidiano.',caption_version='1.0.0',caption_generator_version='integration-fixture',caption_provenance_refs=[],caption_context_fictional=origin=='AI',context_mode='visible'if origin=='REAL'else'fictional')
    if origin=='REAL':assert call(endpoint+'/candidates/'+candidate+'/caption',dict(image_sha256=sha,revision=0,caption={**caption,'context_mode':'documented'}))[0]==400
    assert call(endpoint+'/candidates/'+candidate+'/caption',dict(image_sha256=sha,revision=0,caption=caption))[0]==200
    assert call('/api/admin/review/'+image_id,dict(decision='approved',rights_confirmed=True,authenticity_confirmed=True))[0]==200
    rows.append(dict(candidate=candidate,image_id=image_id,sha=sha,origin=origin,caption=caption))
# A balanced publication still requires the separate caption approvals.
publication='INSERT INTO publication_batches VALUES('+','.join([q('matrix-pub-'+uid),q(json.dumps([r['image_id']for r in rows])),q('fixture-owner'),q(envelope['frozen_at'])])+')'
sql(publication,ok=False)
for row in rows:
    data=dict(image_sha256=row['sha'],caption_revision=1,revision=0,decision='approved',confirm_reviewed=True)
    assert call(endpoint+'/candidates/'+row['candidate']+'/caption-review',{**data,'confirm_reviewed':False})[0]==400
    status,result=call(endpoint+'/candidates/'+row['candidate']+'/caption-review',data);assert status==200,(status,result)
    assert call(endpoint+'/candidates/'+row['candidate']+'/caption-review',data)[0]==409
sql(publication)
status,snapshot=call(endpoint);assert status==200,snapshot
assert snapshot['cells'][cell]['REAL']['approved']==1
assert snapshot['cells'][cell]['REAL']['search_attempts']==1
assert snapshot['cells'][cell]['REAL']['source_hits']==3
assert snapshot['cells'][cell]['REAL']['cost']==.03
assert snapshot['cells'][cell]['AI']['approved']==1
# Correction keeps the intentional yield separate from approved observed coverage.
other=next(c for c in snapshot['cells']if c!=cell)
assert call(endpoint+'/candidates/'+rows[0]['candidate']+'/classification',dict(image_sha256=rows[0]['sha'],revision=0,observed_cell=other,secondary_emotions=['neutrality']))[0]==200
updated=call(endpoint)[1];assert updated['cells'][other]['REAL']['coverage']==1;assert updated['cells'][cell]['REAL']['on_target_approved']==0
assert call(endpoint+'/events')[1]['events']
assert call(endpoint+'/reports',dict(kind='brief_variety',version='1.0.0',report=dict(kind='private_fixture_report',state='not_calculated')))[0]==200
assert call(endpoint)[1]['reports'][0]['kind']=='brief_variety'
# Use an explicit isolated round fixture to exercise captioned non-demo R2 media
# while the shared integration Worker remains in demo mode for all other tests.
status,session=call('/api/sessions',dict(mode='timed',count=1,roundSeconds=10));assert status==201
sid=session['id'];rid=uuid.uuid4().hex;row=rows[1]
sql('DELETE FROM game_rounds WHERE session_id='+q(sid)+'; INSERT INTO game_rounds(id,session_id,image_id,position,game_caption,caption_revision,caption_context_fictional) SELECT '+','.join([q(rid),q(sid),q(row['image_id']),'0','game_caption','revision','fictional'])+' FROM editorial_public_captions WHERE image_id='+q(row['image_id']))
manifest=call('/api/sessions/'+sid+'/manifest')[1]['images'];assert manifest[0]['caption']==row['caption']['game_caption']
serialized=json.dumps(manifest);assert all(word not in serialized for word in ['fictional','provenance','source_url','slop_prompt','caption_revision','image_sha256'])
assert call('/api/sessions/'+sid)[1]['expiresAt'] is None
# A new caption version cannot alter an assigned question or the image vote.
new_caption={**row['caption'],'game_caption':'Un tavolo da lavoro accanto a scaffali e materiali in un ambiente interno.'}
assert call(endpoint+'/candidates/'+row['candidate']+'/caption',dict(image_sha256=row['sha'],revision=1,caption=new_caption))[0]==200
assert call('/api/sessions/'+sid+'/manifest')[1]['images']==manifest
assert call(endpoint+'/candidates/'+row['candidate']+'/caption-review',dict(image_sha256=row['sha'],caption_revision=2,revision=0,decision='approved',confirm_reviewed=True))[0]==200
assert call('/api/sessions/'+sid+'/manifest')[1]['images']==manifest
status,active=call('/api/sessions/'+sid+'/start',dict(prepared=True,roundIds=[rid]));assert status==200,active;deadline=active['expiresAt'];assert active['question']['caption']==manifest[0]['caption']
assert call('/api/sessions/'+sid+'/ready',dict(roundId=rid))[1]['expiresAt']==deadline
status,reveal=call('/api/sessions/'+sid+'/answer',dict(roundId=rid,choice='AI'));assert status==200,reveal;assert reveal['captionContextFictional'] is True
assert call('/api/sessions/'+sid+'/answer',dict(roundId=rid,choice='AI'))[1]['replayed'] is True
assert call('/api/sessions/'+sid+'/answer',dict(roundId=rid,choice='REAL'))[0]==409
assert call(endpoint+'?origin=REAL')[1]['cells'][cell]['AI']['approved']==0
print('Matrix v4 HTTP passed: private auth, immutable brief hash, documentary gates, idempotent registration, independent owner votes/captions, caption publication gate, correction/coverage, reports, immutable public question text, timer start/ready/retry, fictional context only after answer.')
