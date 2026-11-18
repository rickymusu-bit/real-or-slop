"""Local-only API helpers for editorial-loop integration and browser tests."""
from local_db import sql
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from uuid import uuid4
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

counter = 100
DESCRIPTION = {'visible':'A group of people on a street, in flat daylight.', 'documented_context':'Paris in the 1960s, according to Commons.', 'uncertainties':'The individual people cannot be identified.'}
BRIEF = {'required':['street-scene'], 'preferred':['daylight'], 'flexible':['people and viewpoint'], 'exclusions':['identifiable real people']}

def real(prefix='editorial', described=True, gallery=None):
    global counter
    counter += 1
    img=Image.new('RGB',(180,120),(counter%256,80,110));img.putpixel((0,0),(counter%256,20,210))
    out=io.BytesIO();img.save(out,'PNG')
    code,item=call('/upload?'+urllib.parse.urlencode({'origin':'REAL','title':f'{prefix}-{counter}','description':'Original Commons text', **({'gallery_id': gallery} if gallery else {})}), raw=out.getvalue(),library=True); assert code==201,item
    # Match the production browser's WebP upload.
    req=urllib.request.Request(LIBRARY+'/'+item['id']+'/copy',data=game_copy(out.getvalue()),method='POST',headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'image/webp'})
    with urllib.request.urlopen(req) as r:item=json.loads(r.read())
    patch={'revision':item['revision'],'tags':['street-scene','1960s'],'tag_categories':{'street-scene':'genre','1960s':'time'}}
    if described:patch['real_description']=DESCRIPTION
    code,item=call('/'+item['id'],patch,method='PATCH',library=True);assert code==200,item
    code,item=call('/'+item['id']+'/approve',{'rights_confirmed':True},library=True);assert code==200,item
    return item

def historic_draft(ids):
    """Seed existing pipeline-2 processes with the contract deployed before galleries."""
    def quoted(value):
        if not isinstance(value,str): value=json.dumps(value,ensure_ascii=False)
        return "'"+value.replace("'","''")+"'"
    batch_id=uuid4().hex
    now=datetime.now(timezone.utc).isoformat()
    config=call('auto')[1]['config']
    statements=[]; items=[]
    for slot, source in enumerate(ids):
        row=call('/'+source,library=True)[1]
        if row.get('status') not in ('approved','published') or not row.get('real_description'):return 409,{}
        tags=[{'label':tag,'category':row['categories'][tag]} for tag in row['tags']]
        by_category={}
        for tag in tags:by_category.setdefault(tag['category'],[]).append(tag['label'])
        items.append({'title':f'SLOP {slot+1}','tags':tags})
        snapshot={**config,'mode':'automatic','source_description':row['real_description'],'source_tags':by_category,
                  'width':row['width'],'height':row['height'],'target_metrics':row['metrics']}
        process_id=uuid4().hex
        values=','.join((quoted(process_id),quoted(batch_id),str(slot),quoted(snapshot),quoted(now),quoted(now)))
        statements.append(f"INSERT INTO slop_processes(id,batch_id,slot,snapshot,created_at,updated_at) VALUES({values});")
        statements.append(f"INSERT INTO slop_reference_uses(source_id,process_id,created_at) VALUES({quoted(source)},{quoted(process_id)},{quoted(now)});")
    values=','.join((quoted(batch_id),"'[]'",quoted(items),'2',quoted(config),quoted(now),quoted(now)))
    try:sql(f"INSERT INTO slop_batches(id,theme,slots,pipeline_version,loop_settings,created_at,updated_at) VALUES({values});"+''.join(statements))
    except __import__('sqlite3').IntegrityError:return 409,{}
    return call('batches/'+batch_id)

def make_gallery(title, instructions='', description='Fotografie documentarie della piazza.'):
    code,result=call('/galleries',{'title':title,'description':description,'slop_instructions':instructions},library=True)
    assert code==200,result
    return result

def assign_gallery(image, gallery):
    code,result=call('/'+image['id'],{'revision':image['revision'],'gallery_id':gallery},method='PATCH',library=True)
    assert code==200,result
    return result

def batch(source):
    code,b=historic_draft([source['id']]);assert code==200,b
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
