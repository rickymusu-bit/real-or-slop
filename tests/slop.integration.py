"""The generation loop through the SLOP wizard (manual generation retired on 2026-11-22): whole-image evaluation with its editorial
inputs, bounded attempts, processes without a SLOP that wait for the owner, manual acceptance, uncertain outcomes never resent,
frozen settings, tolerance 0, stale claims and the stop of the server run."""
import base64
import concurrent.futures
import io
import time
from PIL import Image
from editorial_helpers import *
from game_copy import game_copy
import urllib.error
import urllib.request

code,settings=call('/settings',library=True);assert code==200
gallery=make_gallery("Galleria del ciclo")['id'];images=[]

def prepare(queue=None):return wizard_prepare(gallery,images,queue=queue)
start,release,wait=wizard_start,wizard_release,wizard_wait
try:
    # The manual generation is gone: no batch is created, edited or run outside the wizard.
    control([])
    for path,body,method in (('batches',{'mode':'manual','gallery_id':gallery,'prompt':'x','brief':BRIEF},'POST'),('batches/x',{'prompts':['x']},'PUT'),
                             ('batches/x/images',{'confirm':True,'index':0},'POST'),('batches/x/run',{'confirm':True,'phase':'images'},'POST'),('batches',None,'GET')):
        assert call(path,body,method=method)[0] in (404,405),path
    assert control()==[]

    # Evaluator decisions: a revised prompt, then acceptance. Every evaluation is a fresh request for the whole candidate.
    b,idea=prepare()
    approved=b['processes'][0]['prompt']
    b=start(b,[None,{'evaluation':'revise_prompt'},None,{'evaluation':'accept'}])
    full=load(b);p=full['processes'][0]
    assert p['state']=='accepted' and len(p['attempts'])==2 and p['calls']==5 and len(full['images'])==1,p  # 1 prompt + 2N
    result=full['images'][0];images.append(result['id'])
    assert result['status']=='new' and 'title' not in result and 'tags' not in result['generation']['slot']
    logs=control();assert [r['path'] for r in logs]==['/v1/images/generations','/v1/responses']*2,logs
    assert logs[0]['body']['prompt']==approved and logs[2]['body']['prompt'].startswith(approved+'\n\n')
    sent=logs[1]['body']['input'][0]['content'][1]['image_url']
    assert Image.open(io.BytesIO(base64.b64decode(sent.split(',')[1]))).size==(96,64)  # the whole candidate, no 4:5 crop
    for n,log in enumerate(logs[1::2]):
        request=log['body'];assert len(request['input'])==1 and len(request['input'][0]['content'])==2
        given=json.loads(request['input'][0]['content'][0]['text'])
        assert set(given)=={'attempt_id','premise','approved_prompt','prompt','gallery','idea','tolerance'},given
        assert given['attempt_id']==p['attempts'][n]['id'] and given['premise']==p['premise'] and given['approved_prompt']==approved
        assert given['idea']['idea'].startswith('Idea di prova per') and given['gallery']['title']=='Galleria del ciclo',given
        assert 'previous_response_id' not in request and 'conversation' not in request
    instructions=logs[1]['body']['instructions']
    assert instructions.startswith('Lavori per un archivio') and 'credibilità fotografica' in instructions and 'ENTIRE unprocessed' in instructions
    assert 'the idea it develops' in instructions
    assert set(p['attempts'][0]['evaluation']['contexts'])=={'base','evaluation'}
    path=p['attempts'][0]['file'].split('/slop/')[1]
    assert call(path,auth=False)[0]==401 and call(path)[0]==200
    # The proposal of the accepted SLOP is used; the link to its REAL is gone.
    assert sql(f"SELECT status FROM real_ideas WHERE id='{idea}'")[0]['status']=='used'
    assert not sql(f"SELECT 1 FROM slop_gallery_sources s JOIN slop_processes p ON p.id=s.process_id WHERE p.batch_id='{b['id']}'")
    assert call('/'+result['id']+'/regenerate',{'confirm':True,'revision':result['revision'],'prompt':'test','quality':'high'},library=True)[0]==409
    # Game copy and treatment set with the sliders, in the browser (owner decisions of 2026-11-16): the Worker checks the record.
    req=urllib.request.Request(LIBRARY+'/'+result['id']+'/original',headers={'Authorization':'Bearer '+TOKEN})
    with urllib.request.urlopen(req) as r:original=r.read()
    req=urllib.request.Request(LIBRARY+'/'+result['id']+'/copy',data=game_copy(original),method='POST',headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'image/webp'})
    with urllib.request.urlopen(req) as r:copy=json.loads(r.read())
    assert copy['copy']['crop']['format']=='4:5'
    sid=result['id'];crop=copy['copy']['crop'];long=max(crop['width'],crop['height'])
    m={'long':long,'noise':2.0,'sharpness':5.0,'contrast':120,'saturation':0.1,'cast':[1,0,-1],'tint':[0,0,0],'v':3}
    chosen={'contrast':1.1,'saturation':0.9,'cast':[3,0,-3],'monochrome':'sepia','blur':0.5,'grain':4,'grainSize':1,'jpeg':0.8,'long':long}
    record={'version':6,'off':False,'seed':7,'long':long,'sample':{'metrics':m},'settings':chosen}
    def upload(treatment):
        q=f"?crop={crop['x']},{crop['y']},{crop['width']},{crop['height']},4:5"
        req=urllib.request.Request(LIBRARY+'/'+sid+'/copy'+q,data=game_copy(original,crop),method='POST',
            headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'image/webp','X-Copy-Treatment':json.dumps(treatment)})
        try:
            with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read())
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    assert upload({**record,'settings':{**chosen,'blur':9}})[0]==400
    assert upload({**record,'settings':{**chosen,'long':long+1},'long':long+1})[0]==400  # longer than the crop
    assert upload({**record,'long':long-1})[0]==400  # the record's long side differs from the settings'
    assert upload({**record,'sample':{'id':'another-real','metrics':m}})[0]==400  # identifying treatment payloads are rejected
    code,treated=upload(record);assert code==201 and treated['treatment']['settings']==chosen,treated
    assert upload(record)[1]['already_prepared'] is True
    control([])
    assert call('/'+result['id']+'/analyze',{'confirm':True},library=True)[0]==404 and control()==[]
    release(b)

    # Exhaustion never creates a library image. A process without a SLOP waits for the owner with every attempt, also through the
    # daily maintenance, until the owner closes it; seven days after the closing its files and rows go. Its proposal stays free.
    assert call('/settings',{'max_generation_attempts':2},method='PUT',library=True)[0]==200
    b,idea=prepare()
    b=start(b,[None,{'evaluation':'retry_same_prompt'}]*2)
    exhausted=load(b)['processes'][0]
    assert exhausted['state']=='exhausted' and load(b)['images']==[] and len(control())==4,exhausted
    assert call('auto/resume',{'confirm':True})[0]==409 and len(control())==4
    seen=next(p for p in call('state')[1]['attention'] if p['id']==exhausted['id'])
    assert len(seen['attempts'])==2 and all(a['file'] and a['prompt'] and a['evaluation'] for a in seen['attempts']),seen
    def maintenance():
        with urllib.request.urlopen(BASE+'/cdn-cgi/handler/scheduled?cron=17+3+*+*+*') as r: assert r.status==200
    sql(f"UPDATE slop_processes SET updated_at='2000-01-01' WHERE id='{exhausted['id']}'; UPDATE slop_attempts SET updated_at='2000-01-01' WHERE process_id='{exhausted['id']}'")
    maintenance();time.sleep(2)
    assert sql(f"SELECT count(*) AS n FROM slop_attempts WHERE process_id='{exhausted['id']}' AND candidate_key IS NOT NULL")[0]['n']==2
    code,closed=call('processes/'+exhausted['id']+'/close',{});assert code==200 and all(p['id']!=exhausted['id'] for p in closed['attention']),closed
    assert call('processes/'+exhausted['id']+'/close',{})[0]==409 and call('processes/'+exhausted['id']+'/close',{'x':1})[0]==400
    assert sql(f"SELECT status FROM real_ideas WHERE id='{idea}'")[0]['status']=='approved'
    assert call('auto')[1]['batch'] is None  # the batch closes with its last decision
    sql(f"UPDATE slop_processes SET updated_at='2000-01-01' WHERE id='{exhausted['id']}'")
    maintenance()
    for _ in range(40):
        if not sql(f"SELECT count(*) AS n FROM slop_processes WHERE id='{exhausted['id']}'")[0]['n']: break
        time.sleep(0.5)
    assert sql(f"SELECT count(*) AS n FROM slop_processes WHERE id='{exhausted['id']}'")[0]['n']==0
    assert call(seen['attempts'][0]['file'].split('/slop/')[1])[0]==404

    # review_needed stops early. The owner accepts a candidate with every finding (owner decisions of 2026-11-16 and 2026-11-17):
    # no paid call, never twice, never without confirmation; evaluation and decision stay separate; the proposal becomes used.
    b,idea=prepare()
    b=start(b,[None,{'evaluation':'review_needed','critical':['Centre: a hand with six fingers'],'minor':['Soft focus at the edge'],
        'uncertainty':['The sign may name another town'],'constraints':False}])
    proc=load(b)['processes'][0];att=proc['attempts'][0]
    assert proc['state']=='review_needed' and len(proc['attempts'])==1 and len(control())==2,proc
    assert call('processes/'+proc['id']+'/accept',{'attempt':att['id']})[0]==400
    assert call('processes/'+proc['id']+'/accept',{'confirm':True,'attempt':'another'})[0]==409
    control([])
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda _:call('processes/'+proc['id']+'/accept',{'confirm':True,'attempt':att['id']}),range(2)))
    assert sorted(r[0] for r in results)==[200,409],results
    assert control()==[]
    saved=load(b)['images'][0];images.append(saved['id'])
    assert saved['status']=='new' and saved['copy'] is None and saved['generation']['slot']['evaluation']==att['evaluation']
    assert saved['generation']['slot']['acceptance']['by']=='owner' and saved['generation']['slot']['acceptance']['attempt']==att['id']
    assert load(b)['processes'][0]['attempts'][0]['evaluation']==att['evaluation']
    assert sql(f"SELECT status FROM real_ideas WHERE id='{idea}'")[0]['status']=='used'
    release(b)

    # A failed or uncertain later attempt leaves the earlier candidate to the owner; a missing private file changes nothing.
    for failure,state in [(400,'failed'),(503,'uncertain')]:
        b,idea=prepare()
        b=start(b,[None,{'evaluation':'retry_same_prompt','minor':['Visible banding']},{'status':failure}])
        proc=load(b)['processes'][0];att=proc['attempts'][0]
        assert proc['state']==state and len(control())==3,proc
        control([])
        key=sql("SELECT candidate_key FROM slop_attempts WHERE id='"+att['id']+"'")[0]['candidate_key']
        sql("UPDATE slop_attempts SET candidate_key='missing' WHERE id='"+att['id']+"'")
        assert call('processes/'+proc['id']+'/accept',{'confirm':True,'attempt':att['id']})[0]==404
        assert load(b)['processes'][0]['state']==state and control()==[]
        sql("UPDATE slop_attempts SET candidate_key='"+key+"' WHERE id='"+att['id']+"'")
        code,done=call('processes/'+proc['id']+'/accept',{'confirm':True,'attempt':att['id']});assert code==200,done
        images.append(done['image']['id']);assert control()==[]
        release(b)

    # Network uncertainty in evaluation preserves the private image and is never resent.
    b,idea=prepare()
    b=start(b,[None,{'status':503}])
    assert load(b)['processes'][0]['state']=='uncertain' and load(b)['images']==[] and len(control())==2
    assert call('auto/resume',{'confirm':True})[0]==409 and len(control())==2
    release(b)

    # Settings are frozen when the prompts are prepared; 1-5 validation. Tolerance 0: a candidate with minor defects is never accepted
    # and never stops the loop; the owner can still accept it.
    assert call('/settings',{'max_generation_attempts':0},method='PUT',library=True)[0]==400
    assert call('/settings',{'max_generation_attempts':6},method='PUT',library=True)[0]==400
    assert call('/settings',{'max_generation_attempts':2,'editorial_tolerance':0},method='PUT',library=True)[0]==200
    b,idea=prepare()
    assert call('/settings',{'max_generation_attempts':1,'editorial_tolerance':1},method='PUT',library=True)[0]==200
    assert load(b)['config']['max_generation_attempts']==2 and load(b)['config']['editorial_tolerance']==0
    b=start(b,[None,{'evaluation':'accept','minor':['slightly soft focus on the left edge']},None,{'evaluation':'accept','minor':['faint banding in the sky']}])
    proc=load(b)['processes'][0]
    assert proc['state']=='exhausted' and proc['attempts'][0]['evaluation']['decision']=='retry_same_prompt' and load(b)['images']==[],proc
    att=proc['attempts'][0];control([])
    code,done=call('processes/'+proc['id']+'/accept',{'confirm':True,'attempt':att['id']});assert code==200,done
    images.append(done['image']['id']);assert control()==[]
    chosen_image=load(b)['images'][0]
    assert chosen_image['prompt']==att['prompt'] and chosen_image['generation']['slot']['acceptance']['attempt']==att['id']
    release(b)

    # A Worker that died after recording a claim is suspended, including its paid ledger, after ten minutes.
    b,idea=prepare()
    pid=b['processes'][0]['id']
    sql(f"UPDATE slop_processes SET state='running',updated_at='2000-01-01' WHERE id='{pid}'; INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,process_id) VALUES('editorial-stale-call','images','fake','pending','2000-01-01','2000-01-01','{pid}')")
    control([]);assert load(b)['processes'][0]['state']=='uncertain'
    assert call('auto/start',{'batch':b['id'],'count':1,'confirm':True})[0]==409 and control()==[]
    assert sql("SELECT status FROM paid_calls WHERE id='editorial-stale-call'")[0]['status']=='uncertain'
    release(b)

    # «Interrompi»: the step in progress ends without its evaluation and no further paid step starts.
    assert call('/settings',{'max_generation_attempts':3},method='PUT',library=True)[0]==200
    b,idea=prepare()
    control([{'delay':2},{'evaluation':'retry_same_prompt'}]+[None,{'evaluation':'retry_same_prompt'}]*4)
    assert call('auto/start',{'batch':b['id'],'count':1,'confirm':True})[0]==200
    for _ in range(200):
        if any(r['path']=='/v1/images/generations' for r in control()):break
        time.sleep(.05)
    assert call('auto/stop',{'batch':b['id']})[0]==200
    b=wait();p=load(b)['processes'][0]
    assert p['state']=='review_needed' and len(p['attempts'])==1 and [r['path'] for r in control()]==['/v1/images/generations'],p
    release(b)
finally:
    state=call('auto')[1]
    if state['batch'] and state['batch']['gallery_id']==gallery:
        try:release(state['batch'])
        except AssertionError:pass
    remove(images)
    call('/settings',settings['values'],method='PUT',library=True)
print('Generation loop through the wizard: full images, evaluator decisions, bounded attempts, owner decisions, uncertainty, frozen settings, stop.')
