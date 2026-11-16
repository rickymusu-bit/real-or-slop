"""Automatic batches: proposal, configuration, consent, persistent retries, old-batch guard and manual publication."""
from editorial_helpers import *
sql("UPDATE images SET trashed_from=CASE status WHEN 'new' THEN 'new' ELSE 'approved' END,status='trash' WHERE status<>'trash'; DELETE FROM slop_batches; DELETE FROM slop_proposal_ignored")
code,settings=call('/settings',library=True);assert code==200
call('/settings',{'slop_section_min_real':1,'max_generation_attempts':2},method='PUT',library=True)
ids=[];generated=[]
def wait_auto(seconds=90):
    for _ in range(seconds*4):
        auto=call('auto')[1]
        if not auto['batch'] or auto['batch']['status']!='running' or not (auto['batch']['runner'] or {}).get('alive'):return auto
        __import__('time').sleep(.25)
    raise AssertionError('the automatic batch is still running on the server')
try:
    ids=[real('auto-loop')['id'] for _ in range(3)]
    code,auto=call('auto');assert code==200 and auto['proposal']['size']==3,auto
    assert auto['config']['max_generation_attempts']==2
    # The whole loop runs on Cloudflare (Workflow): briefs, attempts, tags. First photo exhausts, second is suspended, third accepted.
    control([None]*3+[None,{'evaluation':'retry_same_prompt'},None,{'evaluation':'retry_same_prompt'},None,{'evaluation':'review_needed'},None,{'evaluation':'accept'}])
    assert call('auto/start',{'size':3})[0]==400
    assert call('auto/start',{'size':2,'confirm':True})[0]==409
    code,auto=call('auto/start',{'size':3,'confirm':True});assert code==200,auto
    b=auto['batch'];bid=b['id'];assert b['pipeline_version']==2 and b['config']['max_generation_attempts']==2 and b['runner']['status'] in ('running','done'),b
    assert call('auto/start',{'size':3,'confirm':True})[0]==409
    assert call('auto/resume',{'confirm':True})[0]==409  # alive or finished: never a second runner
    assert call('batches/'+bid,{'prompts':['x']*3},method='PUT')[0]==409
    assert call('batches/'+bid+'/run',{'confirm':True,'phase':'images'})[0]==409  # automatic batches run from their proposal
    auto=wait_auto()
    assert auto['batch']['status']=='review',auto
    b=call('batches/'+bid)[1]
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
    # Legacy paused batch is inspectable; no speculative paid resume.
    sql("INSERT INTO slop_batches(id,theme,slots,origin,auto_status,auto_size,prompts_status,created_at,updated_at) VALUES('old-paused-loop','[]','[]','auto','running',1,'done','x','x')")
    assert call('auto')[1]['batch']['pipeline_version']==1
    assert call('batches/old-paused-loop/images',{'confirm':True,'index':0,'quality':'high'})[0]==409
    assert control()==[]
    call('auto/stop',{})
finally:
    remove(generated+ids);call('/settings',settings['values'],method='PUT',library=True)
print('Automatic editorial loops: consent, proposals, bounded per-photo outcomes, resume guard, legacy protection and manual publication passed.')
