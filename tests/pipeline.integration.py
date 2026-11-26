"""Whole-gallery pipeline, explicit call gates, persistent claims, edits and source/file cleanup."""
import base64, time
import editorial_helpers as H
from editorial_helpers import *

gallery=make_gallery('Pipeline integration')
source=real('pipeline',gallery=gallery['id'])
H.API=BASE+'/api/admin/pipeline/'+gallery['id']+'/'
def wait(predicate):
    for _ in range(160):
        state=call('')[1]
        if predicate(state):return state
        time.sleep(.2)
    raise AssertionError(state)
def paid_request(**extra):return {'confirm':True,'request':str(uuid4()),**extra}
control([])
assert call('',auth=False)[0]==401
assert call('prepare',{'ids':[source['id']],'max_calls':1})[0]==400
assert control()==[]
assert 'index' not in call('')[1]
assert call('index',paid_request(id=source['id'],max_calls=1))[0]==404
assert control()==[]
request=paid_request(ids=[source['id']],max_calls=1)
assert call('prepare',request)[0]==200
state=wait(lambda s:s['sources'][0]['profile'] is not None and not s['jobs'])
assert len(control())==1 and control()[0]['body']['text']['format']['name']=='pipeline_profile'
assert state['sources'][0]['profile']['parameters']['aspect_ratio']['value']=='180:120'
assert call('prepare',request)[0]==200 and len(control())==1  # cached profile never charged twice
# A stale enqueue can outlive the job that first populated the source. Recheck the cache inside the Workflow before paying.
cached_job=str(uuid4());stamp='2026-11-26T00:00:00.000Z'
snapshot={'operation':'profile','sourceRevision':state['sources'][0]['revision'], 'settings':state['settings'],
          'textModel':'gpt-6.1-sol','imageModel':'gpt-image-2.5-flare','quality':'high'}
frozen=json.dumps(snapshot).replace("'", "''")
sql(f"INSERT INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at) VALUES('{cached_job}','{gallery['id']}','{source['id']}','queued','{frozen}','{cached_job}','{stamp}','{stamp}')")
wait(lambda s:not s['jobs'])
assert len(control())==1, 'A source completed by another preparation must be reused inside the Workflow'
assert call('plan',paid_request(ids=[source['id']],max_calls=2))[0]==400
planned=paid_request(ids=[source['id']],max_calls=1)
assert call('plan',planned)[0]==200
state=wait(lambda s:bool(s['jobs']) and s['jobs'][0]['state']=='proposal');job=state['jobs'][0]
assert call('plan',planned)[0]==200 and len(control())==2
assert 'input_image' not in json.dumps(control()[1]['body']['input'])
assert call(job['id']+'/generate',{})[0]==400 and len(control())==2
stale=json.loads(json.dumps(job['proposal']));stale['scene']['environment']='A different unconfirmed scene.'
assert call(job['id']+'/generate',paid_request(max_calls=1,proposal=stale))[0]==409 and len(control())==2
generation=paid_request(max_calls=1,proposal=job['proposal'])
assert call(job['id']+'/generate',generation)[0]==200
state=wait(lambda s:s['jobs'][0]['state']=='candidate');job=state['jobs'][0]
assert len(control())==3
assert control()[-1]['path']=='/v1/images/generations'
assert 'image' not in control()[-1]['body'] and 'mask' not in control()[-1]['body']
assert control()[-1]['body']['size']=='1536x1024'
assert call(job['id']+'/generate',generation)[0]==409 and len(control())==3
assert call(job['id']+'/evaluate',paid_request(max_calls=1))[0]==200
state=wait(lambda s:s['jobs'][0]['state']=='review');job=state['jobs'][0]
assert len(control())==4 and len(job['evaluation']['corrections'])==1
time.sleep(.3);assert len(control())==4  # proposal never executes a paid edit
assert call(job['id']+'/edit',{'max_calls':1})[0]==400 and len(control())==4
code,imagebytes=call(job['id']+'/file');assert code==200
image=Image.open(io.BytesIO(imagebytes));mask=Image.new('RGBA',image.size,(0,0,0,255))
mask.putpixel((0,0),(0,0,0,0));out=io.BytesIO();mask.save(out,'PNG')
assert call(job['id']+'/edit',paid_request(max_calls=1,instruction='Repair only the selected detail.',mask=base64.b64encode(out.getvalue()).decode()))[0]==200
state=wait(lambda s:s['jobs'][0]['state']=='candidate');job=state['jobs'][0]
assert len(control())==5 and control()[-1]['path']=='/v1/images/edits'
assert control()[-1]['body']['files']['image[]']['size']==list(image.size)
assert control()[-1]['body']['files']['mask']['size']==list(image.size)
assert job['previous_key'] and job['evaluation'] # original review retained, no automatic re-evaluation
assert call(job['id']+'/file?previous=1')[0]==200
assert call(job['id']+'/accept',paid_request())[0]==200
state=call('')[1];assert not state['jobs'] and len(state['images'])==1
assert state['images'][0]['status']=='new' and state['images'][0]['copy'] is None
assert len(control())==5
assert sql("SELECT count(*) AS n FROM pipeline_jobs WHERE gallery_id='"+gallery['id']+"'")[0]['n']==0
print('Pipeline passed: cached gallery profiles, controlled variations, text-only images, owner-gated evaluation/edits, full-image mask, acceptance without source genealogy.')

# A source cannot be substituted from another gallery; no model request is spent.
other=make_gallery('Other pipeline gallery');foreign=real('foreign-pipeline',gallery=other['id'])
control([])
assert call('plan',paid_request(ids=[foreign['id']],max_calls=1))[0]==409
assert control()==[]
# Gallery deletion and closing cannot race a paid step already acquired on the server.
second=real('pipeline-running',gallery=gallery['id']);control([{'delay':.7}])
assert call('prepare',paid_request(ids=[second['id']],max_calls=1))[0]==200
revision=call('/galleries/'+gallery['id'],library=True)[1]['revision']
assert call('/galleries/'+gallery['id'],{'confirm':True,'revision':revision},method='DELETE',library=True)[0]==409
wait(lambda s:all(s0['profile'] for s0 in s['sources']) and not s['jobs'])
# Independent preparations receive the gallery's canonical categories, so equivalent names are reused.
known=json.loads(control()[-1]['body']['input'][0]['content'][0]['text'])['known_categories']
assert known['genre']==['amateur_snapshot'] and known['damage']==['none'],known
# Legacy spelling variants are counted as one category; the owner can merge synonyms for free.
sql(f"UPDATE images SET pipeline_profile=json_set(pipeline_profile,'$.genre','Amateur snapshot') WHERE id='{second['id']}'")
state=call('')[1];genre=next(r for r in state['stats']['rows'] if r['key']=='genre')
assert genre['real']=={'amateur_snapshot':2},genre
assert call('categories',{'confirm':True,'key':'genre','from':[],'into':'x'})[0]==400
code,merged=call('categories',{'confirm':True,'key':'genre','from':['Amateur-Snapshot'],'into':'Amateur photo'})
assert code==200 and merged['updated']>=2,merged
state=call('')[1];genre=next(r for r in state['stats']['rows'] if r['key']=='genre')
assert genre['real']=={'amateur_photo':2} and all(r['profile']['genre']=='amateur_photo' for r in state['sources']),genre
assert call('status')[0]==200 and call('status')[1]=={'jobs':[]}
# An uncertain result stays visible and neither the Workflow nor a repeated request resends it.
control([{'status':503}]);uncertain=paid_request(ids=[source['id']],max_calls=1)
assert call('plan',uncertain)[0]==200
state=wait(lambda s:bool(s['jobs']) and s['jobs'][0]['state']=='attention')
assert len(control())==1 and 'ncertain' in state['jobs'][0]['error']
assert call('plan',uncertain)[0]==200;time.sleep(.2);assert len(control())==1
assert call(state['jobs'][0]['id']+'/close',paid_request())[0]==200
print('Pipeline resilience passed: cross-gallery scope, deletion blocked while paid work runs, uncertainty persisted and never resent.')

# A whole-gallery batch is bounded; cancelling the queue spends no requests for the remainder.
queued_sources=[real('pipeline-queue-'+str(n),gallery=gallery['id']) for n in range(4)]
control([{'delay':2} for _ in range(4)])
assert call('prepare',paid_request(ids=[s['id'] for s in queued_sources],max_calls=4))[0]==200
state=call('')[1]
assert sum(j['state'] in ('working','dispatching') for j in state['jobs'])<=3
code,result=call('stop',{'confirm':True});assert code==200 and result['cancelled']>=1,result
wait(lambda s:all(j['state'] not in ('working','dispatching','queued') for j in s['jobs']))
assert len(control())<=3,control()
print('Pipeline queue passed: at most three acquired operations and cancellation before the remaining paid requests.')

# Closed category lists: proposal (1 text call), owner approval with free remapping, text-only classification,
# closed annotation of new REAL and blind observation of accepted SLOP with the same annotator.
tax=make_gallery('Taxonomy integration')
reals=[real('tax-'+str(n),gallery=tax['id']) for n in range(3)]
H.API=BASE+'/api/admin/pipeline/'+tax['id']+'/'
control([])
assert call('prepare',paid_request(ids=[r['id'] for r in reals],max_calls=3))[0]==200
wait(lambda s:all(x['profile'] for x in s['sources']) and not s['jobs'])
sql(f"UPDATE images SET pipeline_profile=json_set(pipeline_profile,'$.genre','Amateur Snapshot') WHERE id='{reals[0]['id']}'")
assert call('taxonomy/propose',{'max_calls':1})[0]==400
assert call('taxonomy/save',{'keys':{},'approve':True})[0]==409  # nothing to approve yet
control([])
assert call('taxonomy/propose',paid_request(max_calls=1))[0]==200
state=wait(lambda s:s['taxonomy']['draft'] and not s['jobs'])
assert len(control())==1 and control()[0]['body']['text']['format']['name']=='pipeline_taxonomy'
assert 'input_image' not in json.dumps(control()[0]['body']['input'])
observed_input=json.loads(control()[0]['body']['input'][0]['content'][0]['text'])['observed']
assert observed_input['genre']==[{'category':'amateur_snapshot','count':3,'examples':observed_input['genre'][0]['examples']}],observed_input['genre']
keys=state['taxonomy']['draft']['keys']
assert [c['name'] for c in keys['wear']]==['none','light','moderate','heavy'] and [c['name'] for c in keys['genre']]==['amateur_snapshot']
duplicate=json.loads(json.dumps(keys));duplicate['colour'].append({'name':'Ordinary','definition':'','aliases':[]})
assert call('taxonomy/save',{'keys':duplicate,'approve':True})[0]==400
assert state['stats']['rows'][0]['key']=='genre'
assert call('taxonomy/save',{'keys':keys,'approve':True})[0]==200
state=call('')[1];assert state['taxonomy']['approved']['version']==1 and state['taxonomy']['draft'] is None
assert sql(f"SELECT json_extract(pipeline_profile,'$.genre') AS g FROM images WHERE id='{reals[0]['id']}'")[0]['g']=='amateur_snapshot'
assert call('categories',{'confirm':True,'key':'genre','from':['amateur_snapshot'],'into':'x'})[0]==409
# A legacy value outside the list waits for a confirmed text-only classification and is excluded from comparisons.
sql(f"UPDATE images SET pipeline_profile=json_set(pipeline_profile,'$.parameters.colour.category','grey body') WHERE id='{reals[1]['id']}'")
state=call('')[1];assert state['stats']['pending']['real']==1
assert next(r for r in state['stats']['rows'] if r['key']=='colour')['real'].get('pending')==1
assert call('classify',paid_request(max_calls=2))[0]==409
control([])
assert call('classify',paid_request(max_calls=1))[0]==200
state=wait(lambda s:s['stats']['pending']['real']==0 and not s['jobs'])
assert len(control())==1 and control()[0]['body']['text']['format']['name']=='pipeline_classification'
assert 'input_image' not in json.dumps(control()[0]['body']['input'])
assert call('consistency',paid_request(max_calls=1))[0]==409  # fewer than 10 classified REAL
# New REAL are annotated with closed categories.
late=real('tax-late',gallery=tax['id']);control([])
assert call('prepare',paid_request(ids=[late['id']],max_calls=1))[0]==200
wait(lambda s:all(x['profile'] for x in s['sources']) and not s['jobs'])
profile_schema=control()[0]['body']['text']['format']['schema']['properties']['profile']['properties']
assert profile_schema['genre']['enum']==['amateur_snapshot','other','unknown']
assert 'categories' in json.loads(control()[0]['body']['input'][0]['content'][0]['text'])
# Accepted SLOP are observed blind, with the REAL annotator and lists, after explicit confirmation.
control([]);planned=paid_request(ids=[late['id']],max_calls=1)
assert call('plan',planned)[0]==200
state=wait(lambda s:bool(s['jobs']) and s['jobs'][0]['state']=='proposal');job=state['jobs'][0]
assert 'enum' in json.dumps(control()[0]['body']['text']['format']['schema']['properties']['genre'])
assert call(job['id']+'/generate',paid_request(max_calls=1,proposal=job['proposal']))[0]==200
state=wait(lambda s:s['jobs'][0]['state']=='candidate');job=state['jobs'][0]
assert call(job['id']+'/accept',paid_request())[0]==200
state=call('')[1];slop_id=state['images'][0]['id']
assert state['stats']['unmeasured']==[slop_id] and state['stats']['observed_count']==0
control([])
assert call('observe',paid_request(ids=[slop_id],max_calls=2))[0]==400
assert call('observe',paid_request(ids=[slop_id],max_calls=1))[0]==200
state=wait(lambda s:s['stats']['observed_count']==1 and not s['jobs'])
sent=json.loads(control()[0]['body']['input'][0]['content'][0]['text'])
assert len(control())==1 and sent['title'] is None and sent['existing'] is None and 'categories' in sent
assert control()[0]['body']['text']['format']['name']=='pipeline_profile'
assert sql(f"SELECT visual_description FROM images WHERE id='{slop_id}'")[0]['visual_description'] is None
assert call('observe',paid_request(ids=[slop_id],max_calls=1))[0]==409  # already observed, never charged twice
genre=next(r for r in state['stats']['rows'] if r['key']=='genre')
assert genre['observed']=={'amateur_snapshot':1} and state['stats']['unmeasured']==[]
print('Pipeline category lists passed: proposal, owner approval with free remapping, pending classification, closed annotation, blind SLOP observation.')
