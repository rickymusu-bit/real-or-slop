"""HTTP integration against local Worker and real emulated D1."""
import concurrent.futures,http.cookiejar,json,urllib.request,urllib.error
base='http://127.0.0.1:8787'
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def req(path,method='GET',data=None,opener=client):
    request=urllib.request.Request(base+path,method=method,data=json.dumps(data).encode() if data else None,headers={'Content-Type':'application/json'})
    try:
        with opener.open(request) as r:return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
status,result=req('/api/sessions','POST',{'mode':'training','count':4});assert status==201,(status,result)
sid=result['id'];status,state=req('/api/sessions/'+sid);assert state['total']==4
assert not any(k in json.dumps(state) for k in ['explanation','ai_prompt','author','licenseUrl'])
assert req('/api/sessions/'+sid,opener=urllib.request.build_opener())[0]==401
seen=set()
for n in range(4):
    _,state=req('/api/sessions/'+sid);q=state['question'];assert q['id'] not in seen;seen.add(q['id'])
    assert req('/api/sessions/'+sid)[1]['question']['id']==q['id'] # refresh stable
    payload={'roundId':q['id'],'choice':'REAL'}
    with concurrent.futures.ThreadPoolExecutor(2) as executor:
        results=list(executor.map(lambda _:req('/api/sessions/'+sid+'/answer','POST',payload),range(2)))
    assert all(r[0]==200 for r in results),results
    assert 'explanation' in results[0][1]
    assert req('/api/sessions/'+sid+'/answer','POST',{**payload,'choice':'AI'})[0]==409
_,end=req('/api/sessions/'+sid);assert end['done'];assert end['answered']==4;assert len(end['credits'])==4;assert end['score']==200,end
print('Game integration passed: no leaks, ownership, balance, refresh, concurrent replay, summary.')
# Expiry integration uses dedicated local DB command in runner to age a timed session.
_,created=req('/api/sessions','POST',{'mode':'timed','duration':60})
Path=None
from pathlib import Path
Path('/tmp/ros-expiry-session').write_text(created['id'])
_,state=req('/api/sessions/'+created['id']);Path('/tmp/ros-expiry-state.json').write_text(json.dumps({'id':created['id'],'roundId':state['question']['id'],'cookie':'; '.join(c.name+'='+c.value for c in jar)}))
import os,subprocess
expiry=json.loads(Path('/tmp/ros-expiry-state.json').read_text())
# UUID originated from server, never interpolate external user input.
import uuid
uuid.UUID(expiry['id'])
command="UPDATE game_sessions SET expires_at=1 WHERE id='"+expiry['id']+"'"
subprocess.run(['npx','wrangler','d1','execute','DB','--local','--command',command],check=True,stdout=subprocess.DEVNULL,env={**os.environ,'XDG_CONFIG_HOME':'/tmp/real-or-slop-config'})
assert req('/api/sessions/'+expiry['id']+'/answer','POST',{'roundId':expiry['roundId'],'choice':'REAL'})[0]==410
assert req('/api/sessions/'+expiry['id'])[1]['done']
Path('/tmp/ros-expiry-state.json').unlink();Path('/tmp/ros-expiry-session').unlink()
print('Server expiry passed: late answer rejected, session ends at server deadline.')
