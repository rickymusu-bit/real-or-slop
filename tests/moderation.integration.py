"""Run against Wrangler local only; generated test token never printed."""
import json,uuid,urllib.request,urllib.error,os
from pathlib import Path
base=os.environ.get('ROS_TEST_BASE','http://127.0.0.1:8787')
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
def request(path,method='GET',data=None,token_value=token,extra_headers=None):
    raw=data if isinstance(data,bytes) else json.dumps(data).encode() if data else None
    r=urllib.request.Request(base+path,method=method,data=raw,headers={'Authorization':'Bearer '+token_value,'Content-Type':'application/json',**(extra_headers or {})})
    try:
        with urllib.request.urlopen(r) as res:return res.status,res.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
assert request('/api/admin/images',token_value='wrong')[0]==401
uid=str(uuid.uuid4())
metadata=dict(type='AI',title='Synthetic test',description='Test',author='Local tester',source_url='https://example.invalid/test/'+uid,source_id=uid,provider='manual',license_name='CC0',license_url='https://creativecommons.org/publicdomain/zero/1.0/',evidence='Invented fixture; no actual event',explanation='Test only',categories=['arte'],difficulty='facile',ai_model='fixture',ai_prompt='A synthetic square',owner_declaration=True,generation_date='2026-10-25')
status,data=request('/api/admin/import','POST',metadata);assert status==201,(status,data)
image=json.loads(data)['id']
assert request('/api/admin/review/'+image,'POST',dict(decision='approved',notes='Missing checks'))[0]==400
import struct,zlib
color=uuid.uuid4().int%255
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data))
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+bytes([color,30,40])*2)*2))+chunk(b'IEND',b'')
assert request('/api/admin/assets/'+image,'PUT',png,extra_headers={'X-Perceptual-Hash':'invalid'})[0]==400
assert request('/api/admin/assets/'+image,'PUT',png,extra_headers={'X-Perceptual-Hash':'A5A5A5A5A5A5A5A5'})[0]==200
listed=json.loads(request('/api/admin/images')[1]);assert next(row for row in listed if row['id']==image)['perceptual_hash']=='a5a5a5a5a5a5a5a5'
# Replacing a file without a new offline fingerprint must not keep stale data.
assert request('/api/admin/assets/'+image,'PUT',png)[0]==200
listed=json.loads(request('/api/admin/images')[1]);assert next(row for row in listed if row['id']==image)['perceptual_hash'] is None
assert request('/api/admin/assets/'+image)[0]==200
assert request('/api/media/'+image,token_value='')[0]==404
status,data=request('/api/admin/review/'+image,'POST',dict(decision='approved',notes='Verified synthetic fixture',rights_confirmed=True,authenticity_confirmed=True,difficulty='medio',categories=['arte']))
assert status==200,(status,data)
assert request('/api/admin/review/'+image,'POST',dict(decision='rejected',notes='Duplicate'))[0]==409
print('Moderation integration passed: auth, private upload, rights gate, audit decision, replay.')

# Competing editorial decisions must produce a single successful transition.
import concurrent.futures
metadata['source_id']=str(uuid.uuid4());metadata['source_url']+='-concurrent'
status,data=request('/api/admin/import','POST',metadata);assert status==201
race_id=json.loads(data)['id']
with concurrent.futures.ThreadPoolExecutor(2) as executor:
    outcomes=list(executor.map(lambda _:request('/api/admin/review/'+race_id,'POST',dict(decision='rejected',notes='Concurrent review fixture'))[0],range(2)))
assert sorted(outcomes)==[200,409],outcomes
print('Concurrent editorial decisions passed: exactly one audit transition.')

metadata['source_id']=str(uuid.uuid4());metadata['source_url']+='-rights';metadata['license_url']=''
status,data=request('/api/admin/import','POST',metadata);assert status==201
ambiguous=json.loads(data)['id']
assert request('/api/admin/review/'+ambiguous,'POST',dict(decision='approved',notes='Still ambiguous',rights_confirmed=True,authenticity_confirmed=True))[0]==400
print('Ambiguous license remains private in review and cannot be approved.')
