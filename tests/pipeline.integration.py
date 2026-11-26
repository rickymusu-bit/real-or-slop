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
# Rewriting the parameters of every REAL: one call each, strictly one at a time, descriptions kept,
# and a dictionary rebuilt only from the profiles already rewritten (the REAL still queued are left out).
before={r['id']:r['visual_description'] for r in sql(f"SELECT id,visual_description FROM images WHERE gallery_id='{gallery['id']}' AND origin='REAL'")}
ids=[x['id'] for x in call('')[1]['sources']];control([{'delay':.5} for _ in ids])
code,rewrite=call('prepare',paid_request(ids=ids,max_calls=len(ids),refresh=True))
assert code==200 and len(rewrite['jobs'])==len(ids)==2 and rewrite['skipped']==0,rewrite
for _ in range(40):
    state=call('')[1];assert sum(j['state'] in ('working','dispatching') for j in state['jobs'])<=1,state['jobs']
    if not state['jobs']:break
    time.sleep(.1)
state=wait(lambda s:not s['jobs'])
calls=control();assert len(calls)==2,calls
sent=[json.loads(c['body']['input'][0]['content'][0]['text']) for c in calls]
assert sent[0]['known_categories']=={} and sent[1]['known_categories']['genre']==['amateur_snapshot'],sent
assert sent[0]['existing'] is not None and 'sections' not in calls[0]['body']['text']['format']['schema']['properties']
after={r['id']:r['visual_description'] for r in sql(f"SELECT id,visual_description FROM images WHERE gallery_id='{gallery['id']}' AND origin='REAL'")}
assert after==before and all(x['profile']['genre']=='amateur_snapshot' for x in state['sources'])
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
assert sum(j['state'] in ('working','dispatching') for j in state['jobs'])<=1  # preparations of one gallery run in series
code,result=call('stop',{'confirm':True});assert code==200 and result['cancelled']>=3,result
wait(lambda s:all(j['state'] not in ('working','dispatching','queued') for j in s['jobs']))
assert len(control())<=1,control()
print('Pipeline queue passed: REAL preparations of a gallery in series and cancellation before the remaining paid requests.')

# A confirmed group records successive provisional intentions, without inventing accepted images.
balanced=make_gallery('Provisional group balance')
batch_sources=[real('joint-batch-'+str(n),gallery=balanced['id']) for n in range(3)]
H.API=BASE+'/api/admin/pipeline/'+balanced['id']+'/'
control([])
assert call('prepare',paid_request(ids=[r['id'] for r in batch_sources],max_calls=3))[0]==200
wait(lambda s:not s['jobs'])
request=paid_request(ids=[r['id'] for r in batch_sources],max_calls=3)
assert call('plan',request)[0]==200
state=wait(lambda s:len(s['jobs'])==3 and all(j['state']=='proposal' for j in s['jobs']))
frozen={r['id']:r['snapshot'] for r in sql(f"SELECT id,snapshot FROM pipeline_jobs WHERE gallery_id='{balanced['id']}'")}
contexts=[json.loads(v)['drawContext'] for v in frozen.values()]
assert sorted(c['provisional'] for c in contexts)==[0,1,2],contexts
assert all(c['accepted']==0 and c['version']==1 for c in contexts)
assert state['stats']['slop_count']==0
calls=len(control());assert calls==6
assert call('plan',request)[1]['jobs']==[]
assert {r['id']:r['snapshot'] for r in sql(f"SELECT id,snapshot FROM pipeline_jobs WHERE gallery_id='{balanced['id']}'")}==frozen
assert len(control())==calls
for job in state['jobs']:assert call(job['id']+'/close',paid_request())[0]==200
assert call('plan',paid_request(ids=[batch_sources[0]['id']],max_calls=1))[0]==200
state=wait(lambda s:len(s['jobs'])==1 and s['jobs'][0]['state']=='proposal')
context=json.loads(sql(f"SELECT snapshot FROM pipeline_jobs WHERE gallery_id='{balanced['id']}'")[0]['snapshot'])['drawContext']
assert context['provisional']==context['accepted']==0,context
print('Pipeline group balance passed: provisional draws accumulate only within the request, retries preserve snapshots and closing leaves no phantom SLOP.')
