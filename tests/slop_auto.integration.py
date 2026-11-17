"""Automatic batches: owner quantity, unused references, consent, persistent retries and legacy guards."""
from editorial_helpers import *
sql("UPDATE images SET trashed_from=CASE status WHEN 'new' THEN 'new' ELSE 'approved' END,status='trash' WHERE status<>'trash'; DELETE FROM slop_batches")
code,settings=call('/settings',library=True);assert code==200
call('/settings',{'max_generation_attempts':2},method='PUT',library=True)
ids=[];generated=[]
def wait_auto(seconds=90):
    for _ in range(seconds*4):
        auto=call('auto')[1]
        if not auto['batch'] or auto['batch']['status']!='running' or not (auto['batch']['runner'] or {}).get('alive'):return auto
        __import__('time').sleep(.25)
    raise AssertionError('the automatic batch is still running on the server')
try:
    ids=[real('auto-loop')['id'] for _ in range(3)]
    code,auto=call('auto');assert code==200 and auto['available']==3 and auto['balance']['missing']==3 and 'proposal' not in auto,auto
    assert auto['config']['max_generation_attempts']==2
    # The whole loop runs on Cloudflare (Workflow): briefs, attempts, tags. First photo exhausts, second is suspended, third accepted.
    control([None]*3+[None,{'evaluation':'retry_same_prompt'},None,{'evaluation':'retry_same_prompt'},None,{'evaluation':'review_needed'},None,{'evaluation':'accept'}])
    assert call('auto/start',{'size':3})[0]==400
    assert call('auto/start',{'size':3,'confirm':True})[0]==400  # no start without a reviewed extraction
    assert call('auto/preview',{'size':4})[0]==409
    assert call('auto/preview',{'size':1},auth=False)[0]==401
    code,selected=call('auto/preview',{'size':3});assert code==200,selected
    assert {r['id'] for r in selected['references']}==set(ids)
    assert all(r['title'] and r['tags'] and r['description']==DESCRIPTION and r['original'].endswith('/original') for r in selected['references'])
    assert control()==[] and sql("SELECT count(*) AS n FROM slop_reference_uses")[0]['n']==0
    assert sql("SELECT count(*) AS n FROM slop_batches")[0]['n']==0
    # A changed source or configuration never silently substitutes another REAL or sends a paid call.
    changed=call('/'+ids[0],library=True)[1]
    assert call('/'+ids[0],{'revision':changed['revision'],'title':changed['title']+' edited'},method='PATCH',library=True)[0]==200
    assert call('auto/start',{'preview':selected['token'],'confirm':True})[0]==409
    assert call('auto')[1]['batch'] is None and control()==[]
    assert sql("SELECT count(*) AS n FROM slop_reference_uses")[0]['n']==0
    selected=call('auto/preview',{'size':3})[1]
    call('/settings',{'max_generation_attempts':1},method='PUT',library=True)
    assert call('auto/start',{'preview':selected['token'],'confirm':True})[0]==409
    call('/settings',{'max_generation_attempts':2},method='PUT',library=True)
    # A concurrent reservation invalidates the selection without reserving the other references.
    code,held=call('batches',{'sources':[ids[0]]});assert code==200,held
    assert call('auto/start',{'preview':selected['token'],'confirm':True})[0]==409
    assert control()==[] and sql("SELECT count(*) AS n FROM slop_reference_uses")[0]['n']==1
    sql("DELETE FROM slop_batches WHERE id='"+held['id']+"'")
    selected=call('auto/preview',{'size':3})[1]
    expected_sources=[r['id'] for r in selected['references']]
    assert call('auto/start',{'preview':selected['token']})[0]==400
    code,auto=call('auto/start',{'preview':selected['token'],'confirm':True});assert code==200,auto
    b=auto['batch'];bid=b['id'];assert b['pipeline_version']==2 and b['config']['max_generation_attempts']==2 and b['runner']['status'] in ('running','done'),b
    assert call('auto/start',{'preview':selected['token'],'confirm':True})[0]==409
    assert call('auto/resume',{'confirm':True})[0]==409  # alive or finished: never a second runner
    assert call('batches/'+bid,{'prompts':['x']*3},method='PUT')[0]==409
    assert call('batches/'+bid+'/run',{'confirm':True,'phase':'images'})[0]==409  # automatic mode owns the runner
    auto=wait_auto()
    assert auto['batch']['status']=='review',auto
    b=call('batches/'+bid)[1]
    actual_sources=sql("SELECT u.source_id FROM slop_processes p JOIN slop_reference_uses u ON u.process_id=p.id WHERE p.batch_id='"+bid+"' ORDER BY p.slot")
    assert [r['source_id'] for r in actual_sources]==expected_sources
    assert [p['state'] for p in b['processes']]==['exhausted','review_needed','accepted'] and len(b['images'])==1,b
    image=b['images'][0];generated.append(image['id'])
    assert image['status']=='new' and image['analysis']['status']=='done' and image['copy'] is None,image  # tags on the server, copy in the browser
    log=control();assert len(log)==12,[(r['path'],r['body'].get('text',{}).get('format',{}).get('name')) for r in log]
    assert b['runner']['status']=='done' and not b['runner']['alive'],b['runner']
    control([]);assert call('batches/'+bid+'/prompts',{'confirm':True,'index':0})[0]==409
    def gen(index):return call('batches/'+bid+'/images',{'confirm':True,'index':index,'quality':b['config']['quality']})
    assert gen(0)[0]==409 and control()==[]
    # A batch in review that still has REAL to generate (a run that ended early) is resumed on the server, within its maximum.
    assert call('auto/resume',{'confirm':True})[0]==409  # nothing left to generate
    pid=b['processes'][0]['id']
    sql(f"DELETE FROM slop_attempts WHERE process_id='{pid}'; UPDATE slop_processes SET state='ready',attempts=0 WHERE id='{pid}'; UPDATE slop_batches SET runner_status='failed' WHERE id='{bid}'")
    assert call('auto/resume',{})[0]==400
    control([None,{'evaluation':'accept'}])
    code,auto=call('auto/resume',{'confirm':True});assert code==200 and auto['batch']['status']=='running',auto
    auto=wait_auto();b=call('batches/'+bid)[1]
    assert auto['batch']['status']=='review' and b['processes'][0]['state']=='accepted' and b['runner']['status']=='done',b
    resumed=[i for i in b['images'] if i['id'] not in generated];assert len(resumed)==1 and resumed[0]['copy'] is None,resumed  # made in the browser at the review
    generated+=[i['id'] for i in resumed]
    assert len(control())==3  # generation, evaluation, tags
    control([]);remove(generated);generated=[]
    assert call('auto')[1]['batch']['status']=='review'  # suspended cases require acknowledgement
    assert call('auto/close',{})[1]['batch'] is None
    # Quantity is an owner choice, independent of the imbalance; used/reserved mothers are excluded.
    auto=call('auto')[1]
    assert auto['available']==2 and auto['balance']['missing']==3,auto
    control([])
    for size in (0,1.5,11):assert call('auto/preview',{'size':size})[0]==400
    assert control()==[] and call('auto/ignore',{})[0]==404
    chosen_preview=call('auto/preview',{'size':1})[1]
    code,auto=call('auto/start',{'preview':chosen_preview['token'],'confirm':True});assert code==200,auto
    assert auto['batch']['size']==1
    auto=wait_auto();assert auto['batch']['status']=='review',auto
    assert len(auto['batch']['images'])==1 and auto['available']==1,auto
    chosen_child=auto['batch']['images'][0]['id'];generated.append(chosen_child)
    assert len(control())==4
    remove([chosen_child]);generated=[]
    assert call('auto')[1]['batch'] is None and call('auto')[1]['available']==2
    assert call('auto/start',{'preview':chosen_preview['token'],'confirm':True})[0]==409
    assert len(control())==4  # a consumed extraction can never create a second batch
    control([])
    # Legacy paused batch is inspectable; no speculative paid resume.
    sql("INSERT INTO slop_batches(id,theme,slots,origin,auto_status,auto_size,prompts_status,created_at,updated_at) VALUES('old-paused-loop','[]','[]','auto','running',1,'done','x','x')")
    assert call('auto')[1]['batch']['pipeline_version']==1
    assert call('batches/old-paused-loop/images',{'confirm':True,'index':0,'quality':'high'})[0]==409
    assert control()==[]
    call('auto/stop',{})
finally:
    remove(generated+ids);call('/settings',settings['values'],method='PUT',library=True)
print('Automatic editorial loops: consent, chosen quantity, unused references, bounded per-photo outcomes, resume guard, legacy protection and manual publication passed.')
