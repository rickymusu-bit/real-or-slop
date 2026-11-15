"""Automatic batches: proposal, configuration, consent, persistent retries, old-batch guard and manual publication."""
from editorial_helpers import *
sql("UPDATE images SET trashed_from=CASE status WHEN 'new' THEN 'new' ELSE 'approved' END,status='trash' WHERE status<>'trash'; DELETE FROM slop_batches; DELETE FROM slop_proposal_ignored")
code,settings=call('/settings',library=True);assert code==200
call('/settings',{'slop_section_min_real':1,'max_generation_attempts':2},method='PUT',library=True)
ids=[];generated=[]
try:
    ids=[real('auto-loop')['id'] for _ in range(3)]
    code,auto=call('auto');assert code==200 and auto['proposal']['size']==3,auto
    assert auto['config']['max_generation_attempts']==2
    control([])
    assert call('auto/start',{'size':3})[0]==400
    assert call('auto/start',{'size':2,'confirm':True})[0]==409
    code,auto=call('auto/start',{'size':3,'confirm':True});assert code==200,auto
    b=auto['batch'];bid=b['id'];assert b['pipeline_version']==2 and b['config']['max_generation_attempts']==2
    assert call('auto/start',{'size':3,'confirm':True})[0]==409 and control()==[]
    assert call('batches/'+bid,{'prompts':['x']*3},method='PUT')[0]==409
    # One brief request per REAL, each written once.
    code,b=call('batches/'+bid+'/prompts',{'confirm':True,'index':0});assert code==200 and len(control())==1 and b['prompts_status']=='none',b
    assert call('batches/'+bid+'/prompts',{'confirm':True,'index':0})[0]==409 and control()==[]
    for index in (1,2):code,b=call('batches/'+bid+'/prompts',{'confirm':True,'index':index});assert code==200,b
    assert len(control())==2 and b['prompts_status']=='done',b
    assert call('batches/'+bid+'/prompts',{'confirm':True})[0]==409
    # First photo exhausts, second is suspended, third accepted. Others continue independently.
    control([None,{'evaluation':'retry_same_prompt'},None,{'evaluation':'retry_same_prompt'},None,{'evaluation':'review_needed'},None,{'evaluation':'accept'}])
    def gen(index):return call('batches/'+bid+'/images',{'confirm':True,'index':index,'quality':b['config']['quality']})
    assert gen(0)[1]['process']['state']=='retry'
    assert gen(0)[1]['process']['state']=='exhausted'
    assert gen(1)[1]['process']['state']=='review_needed'
    code,image=gen(2);assert code==200 and image['status']=='new';generated.append(image['id'])
    b=call('batches/'+bid)[1]
    assert [p['state'] for p in b['processes']]==['exhausted','review_needed','accepted'] and len(b['images'])==1
    assert call('auto/finish',{})[1]['batch']['status']=='review'
    control([]);assert gen(0)[0]==409 and control()==[]
    remove(generated);generated=[]
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
