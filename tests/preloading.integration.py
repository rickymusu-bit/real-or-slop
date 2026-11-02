"""Preparation/start protocol against real LOCAL D1 and authenticated media."""
import concurrent.futures
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

base = os.environ.get('ROS_TEST_BASE', 'http://127.0.0.1:8787')
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
profile = os.environ.get('ROS_TEST_PROFILE', 'local')
args = ['--env', profile] if profile else []
def req(path, method='GET', data=None, opener=client):
    request = urllib.request.Request(base+path, method=method, data=json.dumps(data).encode() if data is not None else None, headers={'Content-Type':'application/json'})
    try:
        with opener.open(request) as response: return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error: return error.code, json.loads(error.read())
def sql(command):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as file:
        file.write(command); path=file.name
    try:
        out=subprocess.run(['npx','wrangler','d1','execute','DB','--local','--persist-to',os.environ['ROS_TEST_STATE'],'--file',path,'--json',*args],check=True,capture_output=True,text=True)
        return json.loads(out.stdout)[0]['results']
    finally: Path(path).unlink()
def create(mode='timed', count=4):
    status, data=req('/api/sessions','POST',dict(mode=mode,count=count,roundSeconds=20))
    assert status==201,data
    return data['id']
def view(sid): return req('/api/sessions/'+sid)[1]
def manifest(sid): return req('/api/sessions/'+sid+'/manifest')[1]['images']
def begin(sid, images): return req('/api/sessions/'+sid+'/start','POST',dict(prepared=True,roundIds=[r['id'] for r in images]))
def no_secrets(value):
    text=json.dumps(value)
    for secret in ['ai_prompt','explanation','licenseUrl','source_url','perceptual_hash','curation','image_medium','answer"','type"']:
        assert secret not in text,secret

sid=create(count=3); initial=view(sid); images=manifest(sid)
assert initial['phase']=='preparing' and initial['expiresAt'] is None and initial['question'] is None
assert initial['protocolVersion']==2 and initial['timingMode']=='per-image' and initial['total']==3 and len(images)==1
assert req('/api/sessions/'+sid+'/answer','POST',dict(roundId=images[0]['id'],choice='REAL'))[0]==409
assert req('/api/sessions/'+sid+'/ready','POST',dict(roundId=images[0]['id']))[0]==409
assert req('/api/sessions/'+sid+'/start','POST',{})[0]==409
assert begin(sid,[])[0]==409
assert begin(sid,[images[0],images[0]])[0]==409
no_secrets(initial); no_secrets(images)
with client.open(base+images[0]['image']) as response:
    assert response.status==200 and response.headers['Vary']=='Cookie'
    assert response.headers['Cache-Control'].startswith('private,')
    assert response.headers['Content-Type'].startswith('image/') and response.read()
rounds=sql(f"SELECT id,presented_at FROM game_rounds WHERE session_id='{sid}' ORDER BY position")
for future in rounds[1:]:
    assert req('/api/sessions/'+sid+'/ready','POST',dict(roundId=future['id']))[0]==409
    try:
        client.open(base+f"/api/sessions/{sid}/media/{future['id']}"); raise AssertionError('Future timed media readable')
    except urllib.error.HTTPError as error: assert error.code==404
outsider=urllib.request.build_opener()
assert req('/api/sessions/'+sid+'/manifest',opener=outsider)[0]==401
try:
    outsider.open(base+images[0]['image']); raise AssertionError('Unowned media readable')
except urllib.error.HTTPError as error: assert error.code==401
assert all(r['presented_at'] is None for r in rounds)
with concurrent.futures.ThreadPoolExecutor(2) as executor:
    starts=list(executor.map(lambda _:begin(sid,images),range(2)))
assert all(status==200 for status,_ in starts),starts
active=starts[0][1]
assert active['phase']=='active' and active['expiresAt']-active['startedAt']==20000
assert starts[1][1]['expiresAt']==active['expiresAt'] and starts[1][1]['startedAt']==active['startedAt']
assert begin(sid,images)[1]['expiresAt']==active['expiresAt']
assert sql(f"SELECT count(*) AS n FROM media_events WHERE session_id='{sid}' AND kind='started'")[0]['n']==1
assert req('/api/sessions/'+sid+'/ready','POST',dict(roundId=rounds[-1]['id']))[0]==409
assert req('/api/sessions/'+sid+'/answer','POST',dict(roundId=rounds[-1]['id'],choice='REAL'))[0]==409
first=view(sid)['question']; assert first==active['question']
assert req('/api/sessions/'+sid+'/answer','POST',dict(roundId=first['id'],choice='REAL'))[0]==200
second=view(sid)['question']; assert view(sid)['expiresAt'] is None
with concurrent.futures.ThreadPoolExecutor(2) as executor:
    ready=list(executor.map(lambda _:req('/api/sessions/'+sid+'/ready','POST',dict(roundId=second['id'])),range(2)))
assert all(status==200 for status,_ in ready),ready
second_deadline=ready[0][1]['expiresAt']
assert all(state['expiresAt']==second_deadline for _,state in ready)
assert 19000 < second_deadline-ready[0][1]['serverNow'] <= 20000
assert req('/api/sessions/'+sid+'/ready','POST',dict(roundId=second['id']))[1]['expiresAt']==second_deadline
assert view(sid)['expiresAt']==second_deadline  # Refresh/reconnect/absence never extends it.
sql(f"UPDATE game_rounds SET expires_at=1 WHERE id='{second['id']}'")
assert req('/api/sessions/'+sid+'/answer','POST',dict(roundId=second['id'],choice='REAL',elapsedMs=0,serverNow=0))[0]==410
following=view(sid); assert following['phase']=='active' and following['timedOut']==1 and following['expiresAt'] is None
assert following['question']['id']==rounds[-1]['id']
assert req('/api/sessions/'+sid+'/ready','POST',dict(roundId=second['id']))[0]==409
assert sql(f"SELECT count(*) AS n FROM answers WHERE round_id='{second['id']}'")[0]['n']==0
third=following['question']; assert req('/api/sessions/'+sid+'/ready','POST',dict(roundId=third['id']))[0]==200
sql(f"UPDATE game_rounds SET expires_at=1 WHERE id='{third['id']}'")
with concurrent.futures.ThreadPoolExecutor(2) as executor:
    final_race=list(executor.map(lambda action:req('/api/sessions/'+sid+action, 'POST' if action else 'GET', dict(roundId=third['id'],choice='AI') if action else None),['','/answer']))
assert final_race[1][0]==410,final_race
finished=view(sid); assert finished['phase']=='completed' and finished['timedOut']==2 and finished['answered']==3
assert len(finished['credits'])==3 and sum(c['timedOut'] for c in finished['credits'])==2
assert sql(f"SELECT count(*) AS n FROM answers a JOIN game_rounds r ON r.id=a.round_id WHERE r.session_id='{sid}'")[0]['n']==1
assert finished['elapsedMs']>=40000

expired=create(); sql(f"UPDATE game_sessions SET preparation_expires_at=1 WHERE id='{expired}'")
invalid=view(expired); assert invalid['phase']=='invalidated' and invalid['done'] and invalid['score']==0
assert invalid['invalidReason']=='preparation_expired' and invalid['credits']==[]
assert req('/api/sessions/'+expired+'/start','POST',{})[0]==410
assert sql(f"SELECT completed,expires_at FROM game_sessions WHERE id='{expired}'")[0]==dict(completed=0,expires_at=None)
assert sql(f"SELECT count(*) AS n FROM media_events WHERE session_id='{expired}'")[0]['n']==1

training=create('training',4); window=manifest(training); assert len(window)==3
rounds=sql(f"SELECT id,position,presented_at FROM game_rounds WHERE session_id='{training}' ORDER BY position")
assert all(r['presented_at'] is None for r in rounds)
try:
    client.open(base+f"/api/sessions/{training}/media/{rounds[3]['id']}"); raise AssertionError('Out-of-window media readable')
except urllib.error.HTTPError as error: assert error.code==404
q=view(training)['question']; assert q['id']==window[0]['id']
assert req('/api/sessions/'+training+'/answer','POST',dict(roundId=q['id'],choice='REAL'))[0]==409
assert req('/api/sessions/'+training+'/report','POST',dict(reason='media_unavailable'))[0]==200
assert view(training)['question']==q and view(training)['answered']==0
assert req('/api/sessions/'+training+'/ready','POST',dict(roundId=q['id']))[0]==200
with concurrent.futures.ThreadPoolExecutor(2) as executor:
    response=list(executor.map(lambda action:req('/api/sessions/'+training+'/'+action,'POST',dict(roundId=q['id'],choice='REAL') if action=='answer' else dict(reason='media_unavailable')),['answer','invalidate']))
assert response[0][0] in [200,410],response
assert view(training)['phase']=='invalidated' and view(training)['score']==0
assert sql(f"SELECT count(*) AS n FROM media_events WHERE session_id='{training}' AND kind='invalidated'")[0]['n']==1

# Last-answer completion and cancellation are mutually exclusive transactions.
last_game=create('training',1); last_q=view(last_game)['question']
assert req('/api/sessions/'+last_game+'/ready','POST',dict(roundId=last_q['id']))[0]==200
with concurrent.futures.ThreadPoolExecutor(2) as executor:
    final_race=list(executor.map(lambda action:req('/api/sessions/'+last_game+'/'+action,'POST',dict(roundId=last_q['id'],choice='REAL') if action=='answer' else dict(reason='media_unavailable')),['answer','invalidate']))
final=view(last_game)
assert final['phase'] in ['completed','invalidated'],final
assert sql(f"SELECT completed FROM game_sessions WHERE id='{last_game}'")[0]['completed']==(1 if final['phase']=='completed' else 0)
if final['phase']=='invalidated': assert final['score']==0 and final['credits']==[]
else: assert final['answered']==1 and len(final['credits'])==1

# Completed/expired legacy sessions retain their assignments and absolute timer.
legacy=str(uuid.uuid4()); owner=hashlib.sha256(next(c.value for c in jar if c.name=='ros_owner').encode()).hexdigest(); end=int(time.time()*1000)+60000
image=sql(f"SELECT image_id FROM game_rounds WHERE session_id='{training}' LIMIT 1")[0]['image_id']
rid=str(uuid.uuid4())
sql(f"INSERT INTO game_sessions(id,mode,created_at,expires_at,owner_hash) VALUES('{legacy}','timed',1,{end},'{owner}'); INSERT INTO game_rounds(id,session_id,image_id,position) VALUES('{rid}','{legacy}','{image}',0);")
old=view(legacy); assert old['protocolVersion']==1 and old['expiresAt']==end and old['question']['id']==rid
assert req('/api/sessions/'+legacy+'/start','POST',{})[1]['expiresAt']==end
assert req('/api/sessions/'+legacy+'/answer','POST',dict(roundId=rid,choice='REAL'))[0]==200
print('Per-image/preloading integration passed: private neutral manifests, training window/ready, no early timestamp/answer, current-only preparation, hidden future media, concurrent idempotent start/ready, unchanged expiry, independent round deadlines, timeout/answer race without fabricated answers, TTL invalidation, error audit, cancel/answer race and legacy timer.')

legacy_v2=str(uuid.uuid4()); rid_v2=str(uuid.uuid4())
sql(f"INSERT INTO game_sessions(id,mode,created_at,owner_hash,protocol_version,phase,duration_seconds,preparation_expires_at) VALUES('{legacy_v2}','timed',1,'{owner}',2,'preparing',60,{end}); INSERT INTO game_rounds(id,session_id,image_id,position) VALUES('{rid_v2}','{legacy_v2}','{image}',0);")
old_manifest=manifest(legacy_v2)
status, old_v2=begin(legacy_v2,old_manifest)
assert status==200 and old_v2['timingMode']=='legacy' and old_v2['expiresAt']-old_v2['startedAt']==60000
assert sql(f"SELECT expires_at FROM game_rounds WHERE id='{rid_v2}'")[0]['expires_at'] is None
print('Both legacy protocol versions preserve the original total timer.')
