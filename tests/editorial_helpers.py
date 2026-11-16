"""Local-only API helpers for editorial-loop integration and browser tests."""
import io
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image
from game_copy import game_copy
BASE = os.environ['ROS_TEST_BASE']; assert BASE.startswith('http://127.0.0.1:')
LIBRARY = BASE + '/api/admin/library'
API = LIBRARY + '/slop/'
FAKE = os.environ['ROS_TEST_FAKE_OPENAI']; assert FAKE.startswith('http://127.0.0.1:')
TOKEN = Path('.dev.vars').read_text().strip().split('=', 1)[1]

def call(path, data=None, method=None, raw=None, library=False, auth=True):
    body = raw if raw is not None else json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request((LIBRARY if library else API) + path, data=body,
        method=method or ('POST' if body is not None else 'GET'), headers={'Authorization': 'Bearer ' + TOKEN if auth else '',
        'Content-Type': 'image/png' if raw is not None else 'application/json'})
    try:
        with urllib.request.urlopen(request) as r:
            data = r.read()
            return r.status, json.loads(data) if r.headers.get('Content-Type', '').startswith('application/json') else data
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())

def control(queue=None):
    req = urllib.request.Request(FAKE+'/control', data=json.dumps({'queue':queue}).encode() if queue is not None else None,
                                 headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read()).get('log')

def sql(command):
    out = subprocess.run(['npx','wrangler','d1','execute','DB','--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE'],'--command',command,'--json'], capture_output=True,text=True,check=True)
    return json.loads(out.stdout)[-1]['results']

counter = 100
DESCRIPTION = {'visible':'A group of people on a street, in flat daylight.', 'documented_context':'Paris in the 1960s, according to Commons.', 'uncertainties':'The individual people cannot be identified.'}
BRIEF = {'required':['street-scene'], 'preferred':['daylight'], 'flexible':['people and viewpoint'], 'exclusions':['identifiable real people']}

def real(prefix='editorial', described=True):
    global counter
    counter += 1
    img=Image.new('RGB',(180,120),(counter%256,80,110));img.putpixel((0,0),(counter%256,20,210))
    out=io.BytesIO();img.save(out,'PNG')
    code,item=call('/upload?'+urllib.parse.urlencode({'origin':'REAL','title':f'{prefix}-{counter}','description':'Original Commons text'}), raw=out.getvalue(),library=True); assert code==201,item
    # Match the production browser's WebP upload.
    req=urllib.request.Request(LIBRARY+'/'+item['id']+'/copy',data=game_copy(out.getvalue()),method='POST',headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'image/webp'})
    with urllib.request.urlopen(req) as r:item=json.loads(r.read())
    patch={'revision':item['revision'],'tags':['street-scene','1960s'],'tag_categories':{'street-scene':'genre','1960s':'time'}}
    if described:patch['real_description']=DESCRIPTION
    code,item=call('/'+item['id'],patch,method='PATCH',library=True);assert code==200,item
    code,item=call('/'+item['id']+'/approve',{'rights_confirmed':True},library=True);assert code==200,item
    return item

def batch(source):
    code,b=call('batches',{'sources':[source['id']]});assert code==200,b
    code,b=call('batches/'+b['id']+'/prompts',{'confirm':True});assert code==200,b
    return b

def generate(b):return call('batches/'+b['id']+'/images',{'confirm':True,'index':0,'quality':b['config']['quality']})
def load(b):
    code,b=call('batches/'+b['id']);assert code==200,b
    return b

def remove(ids):
    if not ids:return
    call('/bulk',{'action':'trash','ids':ids},library=True)
    call('/bulk',{'action':'delete','ids':ids},library=True)
