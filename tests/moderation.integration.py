"""Run against Wrangler local only; generated test token never printed."""
import base64,json,uuid,urllib.request,urllib.error
from pathlib import Path
base='http://127.0.0.1:8787'
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
def request(path,method='GET',data=None,token_value=token):
    raw=data if isinstance(data,bytes) else json.dumps(data).encode() if data else None
    r=urllib.request.Request(base+path,method=method,data=raw,headers={'Authorization':'Bearer '+token_value,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(r) as res:return res.status,res.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
assert request('/api/admin/images',token_value='wrong')[0]==401
uid=str(uuid.uuid4())
metadata=dict(type='AI',title='Synthetic test',description='Test',author='Local tester',source_url='https://example.invalid/test/'+uid,source_id=uid,provider='manual',license_name='CC0',license_url='https://creativecommons.org/publicdomain/zero/1.0/',evidence='Invented fixture; no actual event',explanation='Test only',categories=['arte'],difficulty='facile',ai_model='fixture',ai_prompt='A synthetic square',owner_declaration=True)
status,data=request('/api/admin/import','POST',metadata);assert status==201,(status,data)
image=json.loads(data)['id']
assert request('/api/admin/review/'+image,'POST',dict(decision='approved',notes='Missing checks'))[0]==400
import io
from PIL import Image
buffer=io.BytesIO();Image.new('RGB',(2,2),(uuid.uuid4().int%255,30,40)).save(buffer,format='PNG')
assert request('/api/admin/assets/'+image,'PUT',buffer.getvalue())[0]==200
assert request('/api/admin/assets/'+image)[0]==200
assert request('/api/media/'+image,token_value='')[0]==404
status,data=request('/api/admin/review/'+image,'POST',dict(decision='approved',notes='Verified synthetic fixture',rights_confirmed=True,authenticity_confirmed=True,difficulty='medio',categories=['arte']))
assert status==200,(status,data)
assert request('/api/admin/review/'+image,'POST',dict(decision='rejected',notes='Duplicate'))[0]==409
print('Moderation integration passed: auth, private upload, rights gate, audit decision, replay.')
