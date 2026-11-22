"""Local-only API helpers for editorial-loop integration and browser tests."""
from local_db import sql
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
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

def free_ideas():
    """Fixture: every REAL outside the trash gets a free approved idea for its current gallery, as if the owner had approved one
    (proposing ideas is a paid call, exercised in analysis.integration.py and the browser suites)."""
    sql("""UPDATE real_ideas SET gallery_id=(SELECT gallery_id FROM images WHERE id=real_ideas.image_id) WHERE status='approved';
    INSERT INTO real_ideas(id,image_id,gallery_id,idea,genre,changes,status,model,base_context,ideas_context,created_at,approved_at)
      SELECT lower(hex(randomblob(16))),i.id,i.gallery_id,'Idea di prova per '||i.title,'Foto di collezione','Ambiente e punto di vista',
        'approved','fake','base','ideas',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM images i WHERE i.origin='REAL' AND i.status<>'trash'
      AND NOT EXISTS(SELECT 1 FROM real_ideas x WHERE x.image_id=i.id AND x.status='approved'
        AND NOT EXISTS(SELECT 1 FROM slop_gallery_sources s WHERE s.idea_id=x.id))""")

counter = 100
fixture_gallery = None
DESCRIPTION = 'Original Commons text'
BRIEF = {'required':['street-scene'], 'preferred':['daylight'], 'flexible':['people and viewpoint'], 'exclusions':['identifiable real people']}  # retired manual briefs

def real(prefix='editorial', gallery=None):
    global counter, fixture_gallery
    if not gallery:
        fixture_gallery = fixture_gallery or make_gallery('Galleria dei test editoriali')['id']
        gallery=fixture_gallery
    counter += 1
    img=Image.new('RGB',(180,120),(counter%256,80,110));img.putpixel((0,0),(counter%256,20,210))
    out=io.BytesIO();img.save(out,'PNG')
    code,item=call('/upload?'+urllib.parse.urlencode({'origin':'REAL','title':f'{prefix}-{counter}','description':'Original Commons text', 'gallery_id':gallery}), raw=out.getvalue(),library=True); assert code==201,item
    # Match the production browser's WebP upload.
    req=urllib.request.Request(LIBRARY+'/'+item['id']+'/copy',data=game_copy(out.getvalue()),method='POST',headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'image/webp'})
    with urllib.request.urlopen(req) as r:item=json.loads(r.read())
    code,item=call('/'+item['id']+'/approve',{'rights_confirmed':True},library=True);assert code==200,item
    return item

def make_gallery(title, description='Fotografie documentarie della piazza.'):
    code,result=call('/galleries',{'title':title,'description':description},library=True)
    assert code==200,result
    return result

def assign_gallery(image, gallery):
    code,result=call('/'+image['id'],{'revision':image['revision'],'gallery_id':gallery},method='PATCH',library=True)
    assert code==200,result
    return result

def load(b):
    code,b=call('batches/'+b['id']);assert code==200,b
    return b

def wizard_wait():
    """The open batch of the SLOP wizard once its server run has stopped."""
    import time
    for _ in range(360):
        batch=call('auto')[1]['batch']
        if batch and not (batch['runner'] or {}).get('alive'):return batch
        time.sleep(.25)
    raise AssertionError('the batch is still running on the server')

def wizard_prepare(gallery, created, prefix='ciclo', queue=None):
    """A batch of one SLOP from the wizard: an approved REAL with a proposal approved as a fixture, premise and prompt by the fake
    model. The REAL id goes into `created` for the cleanup."""
    r=real(prefix,gallery=gallery);created.append(r['id'])
    free_ideas()
    idea=sql(f"SELECT id FROM real_ideas WHERE image_id='{r['id']}' AND status='approved'")[0]['id']
    control(queue or [])
    code,state=call('auto/prepare',{'gallery_id':gallery,'ideas':[idea],'count':1,'request':str(uuid4()),'confirm':True});assert code==200,state
    b=wizard_wait();assert b['proposal_review'] and b['processes'][0]['state']=='ready',b
    return b,idea

def wizard_start(b, queue):
    control(queue)
    code,state=call('auto/start',{'batch':b['id'],'count':1,'confirm':True});assert code==200,state
    return wizard_wait()

def wizard_release(b):
    """Decides the batch: its new images go to the trash and its processes without a SLOP are closed, so that the next can open."""
    full=load(b)
    for image in full['images']:
        if image['status']=='new':call('/'+image['id']+'/trash',{},library=True)
    for p in full['processes']:
        if p['state'] in ('exhausted','review_needed','failed','uncertain'):call('processes/'+p['id']+'/close',{})
    state=call('auto')[1]
    if state['batch'] and state['batch']['id']==b['id'] and state['batch']['gallery_review']=='pending':call('auto/cancel',{'batch':b['id']})
    elif state['batch'] and state['batch']['id']==b['id']:assert call('auto/close',{'batch':b['id']})[0]==200
    assert call('auto')[1]['batch'] is None

def remove(ids):
    if not ids:return
    call('/bulk',{'action':'trash','ids':ids},library=True)
    call('/bulk',{'action':'delete','ids':ids},library=True)
