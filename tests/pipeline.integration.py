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
request=paid_request(ids=[source['id']],max_calls=1)
assert call('prepare',request)[0]==200
state=wait(lambda s:s['sources'][0]['profile'] is not None and not s['jobs'])
assert len(control())==1 and control()[0]['body']['text']['format']['name']=='pipeline_profile'
assert state['sources'][0]['profile']['parameters']['aspect_ratio']['value']=='180:120'
assert call('prepare',request)[0]==200 and len(control())==1  # cached profile never charged twice
assert call('plan',paid_request(ids=[source['id']],max_calls=2))[0]==400
planned=paid_request(ids=[source['id']],max_calls=1)
assert call('plan',planned)[0]==200
state=wait(lambda s:bool(s['jobs']) and s['jobs'][0]['state']=='proposal');job=state['jobs'][0]
assert call('plan',planned)[0]==200 and len(control())==2
assert 'input_image' not in json.dumps(control()[1]['body']['input'])
assert call(job['id']+'/generate',{})[0]==400 and len(control())==2
generation=paid_request(max_calls=1)
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
