"""PR 139: textual briefs, full-image evaluation, bounded attempts, uncertainty, concurrency and private candidates."""
import base64
import concurrent.futures
import io
from PIL import Image
from editorial_helpers import *
from game_copy import game_copy
import urllib.request

code,settings=call('/settings',library=True);assert code==200
assert call('/settings',{'slop_section_min_real':1},method='PUT',library=True)[0]==200
sources=[];images=[]
try:
    historical=real(described=False);sources.append(historical['id']);control([])
    assert call('batches',{'sources':[historical['id']]})[0]==409
    assert control()==[]
    # A private manual description does not alter Commons or tags.
    code,changed=call('/'+historical['id'],{'revision':historical['revision'],'real_description':DESCRIPTION},method='PATCH',library=True)
    assert code==200 and changed['tags']==historical['tags'] and changed['description']=='Original Commons text',changed
    b=batch(changed);[prompt]=control()
    assert prompt['path']=='/v1/responses' and prompt['body']['text']['format']['name']=='slop_brief'
    assert not any(c['type']=='input_image' for c in prompt['body']['input'][0]['content'])
    inp=__import__('json').loads(prompt['body']['input'][0]['content'][0]['text'])
    assert inp['description']==DESCRIPTION and inp['tags']['genre']==['street-scene']
    assert b['max_calls']==8 and b['config']['max_generation_attempts']==3 and b['processes'][0]['state']=='ready'
    # Free edits before the first generation, immutable after the loop starts.
    code,b=call('batches/'+b['id'],{'briefs':[BRIEF],'prompts':['An ordinary documentary street photograph.']},method='PUT');assert code==200,b
    original_brief=b['processes'][0]['brief']
    control([None,{'evaluation':'revise_prompt'},None,{'evaluation':'replan_scene'},None,{'evaluation':'accept'}])
    for expected in ('retry','retry','accepted'):
        code,result=generate(b);assert code==200,result
        assert result['process']['state']==expected,result
        if expected!='accepted':
            assert load(b)['images']==[]
            assert call('batches/'+b['id'],{'briefs':[BRIEF]},method='PUT')[0]==409
    images.append(result['id']);assert result['status']=='new' and result['copy'] is None
    b=load(b);assert b['processes'][0]['brief']==original_brief and len(b['processes'][0]['attempts'])==3
    assert b['processes'][0]['calls']==7 and len(b['images'])==1
    logs=control();assert len(logs)==6
    sent=logs[1]['body']['input'][0]['content'][1]['image_url']
    im=Image.open(io.BytesIO(base64.b64decode(sent.split(',')[1])));assert im.size==(96,64),im.size  # whole 3:2, no 4:5 crop
    assert logs[2]['body']['prompt'].startswith('A revised')
    # The evaluator gets the base, its editable context and the rules fixed in the code; the attempt records the versions.
    instructions=logs[1]['body']['instructions']
    assert instructions.startswith('Lavori per un archivio') and 'credibilità fotografica' in instructions and 'ENTIRE unprocessed' in instructions,instructions[:300]
    assert set(b['processes'][0]['attempts'][0]['evaluation']['contexts'])=={'base','evaluation'}
    attempt=b['processes'][0]['attempts'][0]
    path=attempt['file'].split('/slop/')[1]
    assert call(path,auth=False)[0]==401 and call(path)[0]==200
    # Duplicate sends return the accepted result without additional paid calls.
    assert generate(b)[1]['id']==result['id'] and len(control())==6
    assert call('/'+result['id']+'/regenerate',{'confirm':True,'revision':result['revision'],'prompt':'test','quality':'high'},library=True)[0]==409
    req=urllib.request.Request(LIBRARY+'/'+result['id']+'/original',headers={'Authorization':'Bearer '+TOKEN})
    with urllib.request.urlopen(req) as r:original=r.read()
    req=urllib.request.Request(LIBRARY+'/'+result['id']+'/copy',data=game_copy(original),method='POST',headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'image/webp'})
    with urllib.request.urlopen(req) as r:copy=__import__('json').loads(r.read())
    assert copy['copy']['crop']['format']=='4:5'
    assert call('/'+result['id']+'/analyze',{'confirm':True},library=True)[0]==200
    assert load(b)['processes'][0]['calls']==8  # 2+2N, including the final tags
    assert control()[-1]['body']['text']['format']['schema']['required']==['tags']
    # Exhaustion never creates a library image, and cannot consume another attempt after refresh.
    source=real();sources.append(source['id']);b=batch(source)
    control([None,{'evaluation':'retry_same_prompt'}]*3)
    for n in range(3):code,result=generate(b);assert code==200,result
    assert result['process']['state']=='exhausted' and load(b)['images']==[] and len(control())==6
    assert generate(b)[0]==409 and len(control())==6
    # review_needed stops early, even with attempts available.
    source=real();sources.append(source['id']);b=batch(source);control([None,{'evaluation':'review_needed'}])
    assert generate(b)[1]['process']['state']=='review_needed';assert generate(b)[0]==409 and len(control())==2
    # Network uncertainty in evaluation preserves the private image and never resends.
    source=real();sources.append(source['id']);b=batch(source);control([None,{'status':503}])
    assert generate(b)[0]==502 and load(b)['processes'][0]['state']=='uncertain'
    assert generate(b)[0]==409 and len(control())==2 and load(b)['images']==[]
    # Double click / two tabs: only one generation and evaluation, no duplicate library image.
    source=real();sources.append(source['id']);b=batch(source);control([])
    with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:generate(b),range(2)))
    assert all(code in (200,409) for code,_ in results),results
    b=load(b);assert len(b['images'])==1 and len(control())==2;images.append(b['images'][0]['id'])
    # A confirmed rewrite of brief and prompt raises the maximum of the batch by its call.
    source=real();sources.append(source['id']);rewritten=batch(source);control([])
    code,rewritten=call('batches/'+rewritten['id']+'/prompts',{'confirm':True,'index':0});assert code==200,rewritten
    assert len(control())==1 and rewritten['max_calls']==9 and rewritten['processes'][0]['calls']==2,rewritten
    # A «slop_prompt» written for the twin prompts (pipeline 1) sends no brief call until the owner saves a new version.
    sql("INSERT INTO model_contexts(id,part,body,created_at,pipeline) VALUES('editorial-twin','slop_prompt','Twin prompt text',strftime('%Y-%m-%dT%H:%M:%fZ','now'),1)")
    code,state=call('/contexts',library=True);prompt_part=next(p for p in state['parts'] if p['part']=='slop_prompt')
    assert prompt_part['outdated'] and prompt_part['proposed'],prompt_part
    source=real();sources.append(source['id']);control([])
    code,blocked=call('batches',{'sources':[source['id']]});assert code==200,blocked
    code,result=call('batches/'+blocked['id']+'/prompts',{'confirm':True});assert code==409 and 'gemelle' in result['error'],result
    assert control()==[] and sql("SELECT count(*) AS n FROM paid_calls WHERE process_id IN (SELECT id FROM slop_processes WHERE batch_id='"+blocked['id']+"')")[0]['n']==0
    # Restoring keeps the old pipeline; saving the proposal unblocks.
    code,state=call('/contexts/restore',{'id':'editorial-twin'},library=True);assert code==200
    code,state=call('/contexts',{'part':'slop_prompt','body':prompt_part['proposed']},library=True);assert code==200
    assert not next(p for p in state['parts'] if p['part']=='slop_prompt')['outdated']
    code,unblocked=call('batches/'+blocked['id']+'/prompts',{'confirm':True});assert code==200 and len(control())==1,unblocked
    sql("DELETE FROM model_contexts WHERE id='editorial-twin'")
    # Snapshot unchanged when settings change; 1–5 validation.
    assert call('/settings',{'max_generation_attempts':0},method='PUT',library=True)[0]==400
    assert call('/settings',{'max_generation_attempts':6},method='PUT',library=True)[0]==400
    source=real();sources.append(source['id']);b=batch(source)
    assert call('/settings',{'max_generation_attempts':1,'editorial_tolerance':0},method='PUT',library=True)[0]==200
    assert load(b)['config']['max_generation_attempts']==3
    # Deleting the reference later cannot break the accepted SLOP's analysis or leave stale paid-call foreign keys.
    source=real();sources.append(source['id']);fresh=batch(source);control([])
    code,accepted=generate(fresh);assert code==200,accepted;images.append(accepted['id'])
    req=urllib.request.Request(LIBRARY+'/'+accepted['id']+'/original',headers={'Authorization':'Bearer '+TOKEN})
    with urllib.request.urlopen(req) as r:original=r.read()
    req=urllib.request.Request(LIBRARY+'/'+accepted['id']+'/copy',data=game_copy(original),method='POST',headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'image/webp'})
    with urllib.request.urlopen(req) as r:assert r.status==201
    remove([source['id']])
    assert call('/'+accepted['id']+'/analyze',{'confirm':True},library=True)[0]==200
    # A source in an in-flight process stays in the trash until that operation settles.
    source=real();sources.append(source['id']);pending=batch(source);pid=pending['processes'][0]['id']
    sql(f"UPDATE slop_processes SET state='running' WHERE id='{pid}'")
    call('/'+source['id']+'/trash',{},library=True)
    assert call('/'+source['id'],method='DELETE',library=True)[0]==409
    assert call('/bulk',{'action':'delete','ids':[source['id']]},library=True)[1]=={'deleted':0,'postponed':1}
    sql(f"UPDATE slop_processes SET state='failed' WHERE id='{pid}'")
    assert call('/'+source['id'],method='DELETE',library=True)[1]['deleted']==1
    # A replacement process cannot be bypassed by restoring its trashed predecessor.
    predecessor=images[0];call('/'+predecessor+'/trash',{},library=True)
    replacement=batch(historical);pid=replacement['processes'][0]['id']
    sql(f"UPDATE slop_processes SET state='running' WHERE id='{pid}'")
    assert call('/'+predecessor+'/restore',{},library=True)[0]==409
    sql(f"UPDATE slop_processes SET state='ready' WHERE id='{pid}'")
    code,replaced=generate(replacement);assert code==200,replaced;images.append(replaced['id'])
    assert call('/'+predecessor+'/restore',{},library=True)[0]==409
    # A Worker that died after recording a claim is suspended, including its paid ledger, after ten minutes.
    source=real();sources.append(source['id']);stale=batch(source);pid=stale['processes'][0]['id']
    sql(f"UPDATE slop_processes SET state='running',updated_at='2000-01-01' WHERE id='{pid}'; INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,process_id) VALUES('editorial-stale-call','images','fake','pending','2000-01-01','2000-01-01','{pid}')")
    control([]);assert load(stale)['processes'][0]['state']=='uncertain'
    assert generate(stale)[0]==409 and control()==[]
    assert sql("SELECT status FROM paid_calls WHERE id='editorial-stale-call'")[0]['status']=='uncertain'
    # Legacy batches are readable; no automatic conversion or paid resume.
    legacy='editorial-legacy'
    sql("INSERT INTO slop_batches(id,theme,slots,prompts,prompts_status,created_at,updated_at) VALUES('editorial-legacy','[]','[]','[]','done','x','x')")
    control([]);assert call('batches/'+legacy)[0]==200
    assert call('batches/'+legacy+'/images',{'confirm':True,'index':0,'quality':'high'})[0]==409 and control()==[]
finally:
    remove(images+sources)
    call('/settings',settings['values'],method='PUT',library=True)
print('Editorial loop: combined contracts, text-only brief, all evaluator decisions, attempts/call cap, full image, private candidates, idempotency and legacy guards passed.')
