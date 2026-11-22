"""The SLOP wizard API (owner decisions of 2026-11-22): gallery membership, a free corrected extraction, the REAL a wizard can add with
their proposals, proposals written by the owner, the first confirmation from the chosen proposals (several from one REAL), premise and
prompt corrected before the second confirmation, references until each process ends and proposals used when their SLOP is accepted."""
import base64
from concurrent.futures import ThreadPoolExecutor
import time
from editorial_helpers import *
from catalog import publish, remove as remove_catalog

sql("UPDATE images SET trashed_from=CASE status WHEN 'new' THEN 'new' ELSE 'approved' END,status='trash' WHERE status<>'trash'; DELETE FROM slop_batches")
old = call('/settings',library=True)[1]['values']
call('/settings',{'max_generation_attempts':2},method='PUT',library=True)
photos=[]; catalogue=[]

def candidates(gallery):
    code,data=call('auto/candidates?'+urllib.parse.urlencode({'gallery':gallery['id']}));assert code==200,data
    return data
def own(real_id, text):
    code,item=call('/'+real_id+'/ideas',{'idea':text},library=True);assert code==201,item
    return [i for i in item['ideas'] if i['idea']==text][0]['id']
def prepare(gallery, ideas, request=None, confirm=True, count=None):
    return call('auto/prepare',{'gallery_id':gallery['id'],'ideas':ideas,'count':len(ideas) if count is None else count,
                                'request':request or str(uuid4()),'confirm':confirm})
def update_gallery(gallery, description):
    code,saved=call('/galleries/'+gallery['id'],{'title':gallery['title'],'description':description,'revision':gallery['revision']},method='PATCH',library=True)
    assert code==200,saved
    return saved
def image_count():
    return sum(log['path']=='/v1/images/generations' for log in control())

try:
    control([])
    gallery=make_gallery('Piazza di Parigi')
    other=make_gallery('Console vintage')
    # Without an approved or published REAL there is nothing to extract.
    code,short=call('auto/preview',{'gallery_id':gallery['id'],'size':1});assert code==409 and 'disponibili: 0' in short['error'],short
    assert not next(g for g in call('auto')[1]['galleries'] if g['id']==gallery['id'])['ready']
    assert call('auto/preview',{'gallery_id':gallery['id'],'size':1},auth=False)[0]==401
    assert call('/galleries/'+gallery['id']+'/suggest',{'request':str(uuid4()),'revision':gallery['revision'],'confirm':True},library=True)[0]==404
    one=real(gallery=gallery['id']); photos.append(one['id'])
    assert next(g for g in call('auto')[1]['galleries'] if g['id']==gallery['id'])['ready']
    two=real(gallery=other['id']); unavailable=real(gallery=gallery['id']); outside=real(gallery=other['id'])
    photos.extend([two['id'],unavailable['id'],outside['id']])
    # Without its original in the quarantine a REAL cannot be drawn.
    sql(f"UPDATE images SET original_key='missing-unavailable-original' WHERE id='{unavailable['id']}'")
    code,two=call('/'+two['id']+'/publish',{},library=True); assert code==200,two
    two=assign_gallery(two,gallery['id']); assert two['status']=='published'
    for size in (0,1.5,11):assert call('auto/preview',{'gallery_id':gallery['id'],'size':size})[0]==400
    assert call('auto/preview',{'gallery_id':gallery['id'],'sources':[two['id']]})[0]==400
    # The extraction is free, returns at most the REAL with an original, and creates nothing.
    code,drawn=call('auto/preview',{'gallery_id':gallery['id'],'size':3});assert code==200,drawn
    assert {r['id'] for r in drawn['references']}=={one['id'],two['id']} and drawn['available']==3
    assert sql("SELECT count(*) AS n FROM slop_batches")[0]['n']==0 and control()==[]
    # The REAL the wizard can add, with their proposals.
    listed=candidates(gallery)
    assert {c['id'] for c in listed['candidates']}=={one['id'],two['id'],unavailable['id']} and listed['max_batch']==10
    assert all(c['ideas']==[] and c['levels'] is None for c in listed['candidates'])
    # A proposal written by the owner is free and approved at once; at most three per REAL.
    first=own(one['id'],'La stessa piazza vista dall’alto con un mercato inventato.')
    second=own(one['id'],'Un tram d’epoca inventato attraversa la piazza al tramonto.')
    third=own(two['id'],'Una manifestazione inventata davanti alla stessa facciata.')
    listed=next(c for c in candidates(gallery)['candidates'] if c['id']==one['id'])
    assert control()==[] and [(i['state'],i['model']) for i in listed['ideas']]==[('approved','owner')]*2,listed
    for wrong in ({'idea':''},{'idea':'x'*601},{'idea':'x','other':1}):
        assert call('/'+one['id']+'/ideas',wrong,library=True)[0]==400,wrong
    extra=own(one['id'],'Terza proposta di prova.')
    assert call('/'+one['id']+'/ideas',{'idea':'Quarta'},library=True)[0]==409
    assert call('/ideas/'+extra,{},method='DELETE',library=True)[0]==200

    # First confirmation: validations, then one process per chosen proposal, two from the same REAL.
    for wrong in ({'gallery_id':gallery['id'],'ideas':[first],'count':1,'request':str(uuid4())},
                  {'gallery_id':gallery['id'],'ideas':[first],'count':1,'request':'x','confirm':True},
                  {'gallery_id':gallery['id'],'ideas':[],'count':0,'request':str(uuid4()),'confirm':True},
                  {'gallery_id':gallery['id'],'ideas':[first,first],'count':2,'request':str(uuid4()),'confirm':True}):
        assert call('auto/prepare',wrong)[0]==400,wrong
    assert prepare(gallery,[first],count=2)[0]==409
    assert prepare(other,[first])[0]==409  # a proposal of a REAL in another gallery
    assert sql("SELECT count(*) AS n FROM slop_batches")[0]['n']==0 and control()==[]
    request=str(uuid4())
    control([None,None,{'json':{'premise':'','prompt':'','reason':'Nessuna invenzione compatibile.'}}])
    with ThreadPoolExecutor(2) as pool:
        codes=sorted(pool.map(lambda _:prepare(gallery,[first,second,third],request)[0],range(2)))
    assert codes==[200,409],codes
    review=wizard_wait(); bid=review['id']
    assert bid==request and review['gallery_review']=='pending' and image_count()==0 and len(control())==3
    assert [r['real']['id'] for r in review['proposal_review']['references']]==[one['id'],one['id'],two['id']]
    assert [r['real']['idea']['id'] for r in review['proposal_review']['references']]==[first,second,third]
    assert [p['state'] for p in review['processes']]==['ready','ready','failed'] and review['processes'][2]['error']=='Nessuna invenzione compatibile.'
    links=sql(f"SELECT s.source_id,s.idea_id FROM slop_gallery_sources s JOIN slop_processes p ON p.id=s.process_id WHERE p.batch_id='{bid}' ORDER BY p.slot")
    assert [(l['source_id'],l['idea_id']) for l in links]==[(one['id'],first),(one['id'],second),(two['id'],third)],links
    for slot,log in enumerate(control()):
        payload=log['body'];assert payload['text']['format']['name']=='slop_gallery_proposal' and 'Develop the idea' in payload['instructions']
        supplied,picture=payload['input'][0]['content']
        given=json.loads(supplied['text'])
        assert given['gallery']=={'title':gallery['title'],'description':gallery['description']} and given['levels'] is None
        assert given['idea']['idea']==review['proposal_review']['references'][slot]['real']['idea']['idea']
        source=review['proposal_review']['references'][slot]['real']['id']
        assert base64.b64decode(picture['image_url'].split(',')[1])==call('/'+source+'/original',library=True)[1]
    # Chosen proposals are approved and busy: not editable, not choosable again.
    assert all(i['busy'] for i in next(c for c in candidates(gallery)['candidates'] if c['id']==one['id'])['ideas'])
    assert call('/ideas/'+first,{'idea':'x'},method='PATCH',library=True)[0]==409
    # Premise and prompt are corrected before the second confirmation (free); the evaluator then checks the corrected premise.
    for wrong in ({'batch':bid,'slot':0},{'batch':bid,'slot':0,'premise':''},{'batch':bid,'slot':0,'prompt':'x'*4001},{'batch':bid,'slot':0,'premise':'x','other':1}):
        assert call('auto/proposal',wrong)[0]==400,wrong
    assert call('auto/proposal',{'batch':bid,'slot':2,'premise':'x'})[0]==409  # no proposal for the failed slot
    corrected='Un mercato inventato riempie la piazza vista dall’alto.'
    assert call('auto/proposal',{'batch':bid,'slot':0,'premise':corrected,'prompt':'An aerial photograph of an invented market in the square.'})[0]==200
    review=call('auto')[1]['batch']
    assert review['processes'][0]['premise']==corrected and review['processes'][0]['prompt']=='An aerial photograph of an invented market in the square.'
    assert call('auto/start',{'batch':bid,'count':3,'confirm':True})[0]==409
    assert call('auto/start',{'batch':bid,'count':2})[0]==400 and image_count()==0
    # Settings are frozen at the first confirmation.
    call('/settings',{'max_generation_attempts':1},method='PUT',library=True)
    control([None,{'evaluation':'accept'},None,{'evaluation':'revise_prompt'},None,{'evaluation':'accept'}])
    with ThreadPoolExecutor(2) as pool:
        codes=sorted(pool.map(lambda _:call('auto/start',{'batch':bid,'count':2,'confirm':True})[0],range(2)))
    assert codes==[200,409],codes
    auto=wizard_wait(); assert auto['status']=='review' and auto['config']['max_generation_attempts']==2
    assert image_count()==3 and len(control())==6
    judge=[r for r in control() if r['path']=='/v1/responses'][0]['body']
    assert json.loads(judge['input'][0]['content'][0]['text'])['premise']==corrected
    children=[i['id'] for i in auto['images']]; photos.extend(children); assert len(children)==2
    generated=call('/'+children[0],library=True)[1]
    assert generated['gallery_id']==gallery['id'] and generated['status']=='new'
    # Accepted proposals are used; the proposal whose prompt failed is free again; no link is left.
    assert {i:sql(f"SELECT status FROM real_ideas WHERE id='{i}'")[0]['status'] for i in (first,second,third)}=={first:'used',second:'used',third:'approved'}
    assert not sql(f"SELECT 1 FROM slop_gallery_sources s JOIN slop_processes p ON p.id=s.process_id WHERE p.batch_id='{bid}'")
    saved=json.dumps(call('batches/'+bid)[1])
    assert one['id'] not in saved and one['title'] not in saved and two['id'] not in saved
    assert call('/'+two['id'],library=True)[1]['status']=='published'

    # With exactly ten published REAL, one catalogue photo withdrawn makes a new game ineligible.
    catalogue=publish(LIBRARY, TOKEN, 'gallery-play', real=9, slop=10, seed=157)
    with urllib.request.urlopen(BASE+'/api/levels') as response:
        assert json.load(response)['levels'][0]['available']
    call('/'+two['id']+'/withdraw',{},library=True)
    with urllib.request.urlopen(BASE+'/api/levels') as response:
        assert not json.load(response)['levels'][0]['available']
    call('/'+two['id']+'/publish',{},library=True)
    remove_catalog(LIBRARY,TOKEN,catalogue); catalogue=[]
    # Moving the undecided SLOP keeps the generation snapshot but frees the source gallery's review.
    for child in children:
        code, moved = call('/bulk', {'action': 'gallery', 'ids': [child], 'gallery_id': other['id']}, library=True)
        assert code == 200 and moved == {'done': 1, 'failed': []}, moved
    assert call('batches/'+bid)[1]['images'] == [] and call('auto')[1]['batch'] is None
    remove(children)

    # Changing the gallery after the prompts prevents the confirmation. Cancel drops the references and cannot be replayed.
    control([])
    request=str(uuid4()); assert prepare(gallery,[third],request)[0]==200
    review=wizard_wait()
    gallery=update_gallery(gallery,gallery['description']+' Preferisci luce naturale.')
    assert call('auto')[1]['batch']['proposal_review']['invalid']
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409
    assert call('auto/cancel',{'batch':review['id']})[0]==200
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409 and image_count()==0
    assert prepare(gallery,[third],request)[0]==409  # the same confirmation cannot be reused
    assert sql(f"SELECT status FROM real_ideas WHERE id='{third}'")[0]['status']=='approved'

    # Moving a REAL after the prompts invalidates the batch.
    control([])
    assert prepare(gallery,[third])[0]==200
    review=wizard_wait()
    moved=assign_gallery(call('/'+two['id'],library=True)[1],other['id'])
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409 and image_count()==0
    assign_gallery(moved,gallery['id'])
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409  # the revision still changed
    assert call('auto/cancel',{'batch':review['id']})[0]==200
    # Back in its gallery, the REAL keeps its approved proposal, free again.
    assert [(i['state'],i['busy']) for c in candidates(gallery)['candidates'] if c['id']==two['id'] for i in c['ideas']]==[('approved',False)]

    # Cancel while the first call is in flight: no next prompt, no image.
    fourth=own(two['id'],'Un mercato coperto inventato sotto la stessa facciata.')
    control([{'delay':1.2}])
    assert prepare(gallery,[third,fourth])[0]==200
    pending=call('auto')[1]['batch']['id']
    for _ in range(100):
        if control():break
        time.sleep(.05)
    assert control()
    status, deletion = call('/galleries/'+gallery['id'],{'confirm':True,'revision':gallery['revision']},method='DELETE',library=True)
    assert status==409 and 'generazione in corso' in deletion['error'],deletion
    assert control() and call('auto/cancel',{'batch':pending})[0]==200
    time.sleep(1.3)
    assert len(control())==1 and image_count()==0
    assert not sql("SELECT source_id FROM slop_gallery_sources")

    # An uncertain call stays uncertain without resends; an expired batch closes.
    control([{'status':503}])
    assert prepare(gallery,[third])[0]==200
    review=wizard_wait(); assert review['processes'][0]['state']=='uncertain'
    assert call('auto/resume',{'confirm':True})[0]==409 and len(control())==1
    sql(f"UPDATE slop_batches SET gallery_expires=0 WHERE id='{review['id']}'")
    state=call('auto')[1]; assert state['expired'] and state['batch'] is None
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409
    assert len(control())==1 and not sql("SELECT source_id FROM slop_gallery_sources")

finally:
    if catalogue:remove_catalog(LIBRARY,TOKEN,catalogue)
    remove(photos)
    call('/settings',old,method='PUT',library=True)

print('Wizard API: extraction, candidates, owner proposals, chosen proposals, editable prompts, references, used proposals and invalidations passed.')
