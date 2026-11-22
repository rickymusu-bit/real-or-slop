"""Gallery membership, free sampling of REAL with an approved idea, separate paid confirmations, references until each process ends and
ideas marked as used when their SLOP is accepted."""
import base64
from concurrent.futures import ThreadPoolExecutor
import time
from editorial_helpers import *
from catalog import publish, remove as remove_catalog

sql("UPDATE images SET trashed_from=CASE status WHEN 'new' THEN 'new' ELSE 'approved' END,status='trash' WHERE status<>'trash'; DELETE FROM slop_batches")
old = call('/settings',library=True)[1]['values']
call('/settings',{'max_generation_attempts':2},method='PUT',library=True)
photos=[]; catalogue=[]

def extract(gallery, size):
    free_ideas()
    return call('auto/preview',{'gallery_id':gallery['id'],'size':size})

def prepare(selected, confirm=True):
    return call('auto/prepare',{'preview':selected['token'],'count':len(selected['references']),'confirm':confirm})

def wait_for_batch():
    for _ in range(240):
        batch=call('auto')[1]['batch']
        if batch and batch['runner'] and not batch['runner']['alive']:return batch
        time.sleep(.25)
    raise AssertionError('server never finished')

def update_gallery(gallery, description):
    code,saved=call('/galleries/'+gallery['id'],{
        'title':gallery['title'],'description':description,'revision':gallery['revision'],
    },method='PATCH',library=True)
    assert code==200,saved
    return saved

def image_count():
    return sum(log['path']=='/v1/images/generations' for log in control())

try:
    control([])
    gallery=make_gallery('Piazza di Parigi')
    other=make_gallery('Console vintage')
    one=real(gallery=gallery['id']); photos.append(one['id'])
    # Without an approved idea a REAL is never drawn; the gallery is not ready (no SLOP instructions since 2026-11-22).
    code,short=call('auto/preview',{'gallery_id':gallery['id'],'size':1}); assert one['gallery_id']==gallery['id'] and code==409 and 'disponibili: 0' in short['error'],short
    assert not next(g for g in call('auto')[1]['galleries'] if g['id']==gallery['id'])['ready']
    assert call('auto/prepare',{'preview':'invalid','confirm':True,'count':1})[0]==400
    assert call('auto/preview',{'gallery_id':gallery['id'],'size':1},auth=False)[0]==401
    assert call('/galleries/'+gallery['id']+'/suggest',{'request':str(uuid4()),'revision':gallery['revision'],'confirm':True},library=True)[0]==404
    assert control()==[]
    free_ideas()
    assert next(g for g in call('auto')[1]['galleries'] if g['id']==gallery['id'])['ready']
    description='Fotografie documentarie della piazza. Preserva l’architettura della piazza.'
    gallery=update_gallery(gallery,description)

    two=real(gallery=other['id']); unavailable=real(gallery=gallery['id']); outside=real(gallery=other['id'])
    photos.extend([two['id'],unavailable['id'],outside['id']])
    # Without its original in the quarantine a REAL cannot be drawn (no editorial description is needed since 2026-11-20).
    sql(f"UPDATE images SET original_key='missing-unavailable-original' WHERE id='{unavailable['id']}'")
    assert two['id'] in [i['id'] for i in call('?gallery='+other['id'],library=True)[1]['items']]
    code,two=call('/'+two['id']+'/publish',{},library=True); assert code==200,two
    two=assign_gallery(two,gallery['id'])
    assert two['status']=='published'
    assert sorted(i['gallery_id'] for i in call('?gallery='+gallery['id'],library=True)[1]['items'])==[gallery['id']]*3
    # Original availability is checked against R2 before returning a reference.
    key=sql(f"SELECT original_key FROM images WHERE id='{one['id']}'")[0]['original_key']
    sql(f"UPDATE images SET original_key='missing-gallery-original' WHERE id='{one['id']}'")
    code,short=extract(gallery,2);assert code==409 and 'disponibili: 1' in short['error'],short
    sql(f"UPDATE images SET original_key='{key}' WHERE id='{one['id']}'")
    code,short=extract(gallery,3);assert code==409 and 'disponibili: 2' in short['error'],short
    assert call('auto/preview',{'gallery_id':gallery['id'],'sources':[two['id']]})[0]==400
    for size in (0,1.5,11):assert extract(gallery,size)[0]==400

    control([])
    selected=extract(gallery,2)[1]
    assert {r['id'] for r in selected['references']}=={one['id'],two['id']}
    assert all(r['description']==DESCRIPTION for r in selected['references'])
    assert all(r['idea']['idea']=='Idea di prova per '+call('/'+r['id'],library=True)[1]['title'] for r in selected['references'])
    # A REAL without a free approved idea is never drawn: its only idea approved while the REAL was in another gallery.
    sql(f"UPDATE real_ideas SET gallery_id='{other['id']}' WHERE image_id='{two['id']}'")
    code,short=call('auto/preview',{'gallery_id':gallery['id'],'size':2});assert code==409 and 'disponibili: 1' in short['error'],short
    assert sql("SELECT count(*) AS n FROM slop_batches")[0]['n']==0 and control()==[]
    assert prepare(selected,False)[0]==400
    assert call('auto/start',{'preview':selected['token'],'confirm':True})[0]==409
    # Changing a reference invalidates the free extraction and prevents even the proposal calls.
    one=assign_gallery(one,other['id'])
    assert prepare(selected)[0]==409 and control()==[]
    one=assign_gallery(one,gallery['id'])
    selected=extract(gallery,2)[1]
    control([None,{'json':{'premise':'','prompt':'','reason':'Nessuna invenzione compatibile.'}}])
    with ThreadPoolExecutor(2) as pool:
        codes=sorted(pool.map(lambda _:prepare(selected)[0],range(2)))
    assert codes==[200,409],codes
    review=wait_for_batch(); bid=review['id']
    assert review['gallery_review']=='pending' and image_count()==0 and len(control())==2
    assert [r['real']['id'] for r in review['proposal_review']['references']]==[r['id'] for r in selected['references']]
    assert [p['state'] for p in review['processes']]==['ready','failed']
    assert all('brief' not in p for p in review['processes'])
    assert review['processes'][1]['error']=='Nessuna invenzione compatibile.'
    # The links stay while the processes are open, each with its idea.
    links=sql(f"SELECT s.source_id,s.idea_id FROM slop_gallery_sources s JOIN slop_processes p ON p.id=s.process_id WHERE p.batch_id='{bid}' ORDER BY p.slot")
    assert [(l['source_id'],l['idea_id']) for l in links]==[(r['id'],r['idea']['id']) for r in selected['references']],links
    for ref, log in zip(selected['references'],control()):
        payload=log['body']
        assert payload['text']['format']['name']=='slop_gallery_proposal'
        supplied,picture=payload['input'][0]['content']
        given=json.loads(supplied['text'])
        assert given['gallery']=={'title':gallery['title'],'description':description}
        assert given['reference']=={'title':ref['title'],'description':DESCRIPTION}
        assert given['idea']=={'idea':ref['idea']['idea'],'genre':'Foto di collezione','changes':'Ambiente e punto di vista'} and given['levels'] is None
        assert 'Develop the idea' in payload['instructions']
        original=call('/'+ref['id']+'/original',library=True)[1]
        assert base64.b64decode(picture['image_url'].split(',')[1])==original
        assert Image.open(io.BytesIO(original)).size==(180,120)
    assert call('batches/'+bid+'/images',{'confirm':True,'index':0,'quality':review['config']['quality']})[0]==409
    assert call('auto/start',{'batch':bid,'count':2,'confirm':True})[0]==409
    assert call('auto/start',{'batch':bid,'count':1})[0]==400
    assert image_count()==0
    # Freeze settings and editorial text, and keep the initially displayed prompt on revisions.
    call('/settings',{'max_generation_attempts':1},method='PUT',library=True)
    original_process=review['processes'][0]
    control([None,{'evaluation':'revise_prompt'},None,{'evaluation':'accept'}])
    with ThreadPoolExecutor(2) as pool:
        codes=sorted(pool.map(lambda _:call('auto/start',{'batch':bid,'count':1,'confirm':True})[0],range(2)))
    assert codes==[200,409],codes
    auto=wait_for_batch(); assert auto['status']=='review' and auto['config']['max_generation_attempts']==2
    assert image_count()==2 and len(control())==4  # two attempts with their evaluations, no analysis after acceptance
    first,judge,second,_=control()
    assert first['body']['prompt']==original_process['prompt']
    assert second['body']['prompt'].startswith(original_process['prompt']+'\n\n')
    supplied,picture=judge['body']['input'][0]['content']
    given=json.loads(supplied['text'])
    assert 'brief' not in given and given['premise']==original_process['premise'] and given['gallery']=={'title':gallery['title'],'description':description}
    assert given['idea']['idea']==selected['references'][0]['idea']['idea'], given
    assert 'recognizable' in judge['body']['instructions'] and 'ENTIRE' in judge['body']['instructions']
    assert Image.open(io.BytesIO(base64.b64decode(picture['image_url'].split(',')[1]))).size==(96,64)
    [child]=auto['images']; photos.append(child['id'])
    generated=call('/'+child['id'],library=True)[1]
    assert generated['gallery_id']==gallery['id'] and generated['status']=='new' and generated['copy'] is None
    assert 'brief' not in generated['generation']['slot'] and 'copy_style' not in generated['generation']['slot']
    assert generated['generation']['slot']['target_metrics'] is None or 'long' in generated['generation']['slot']['target_metrics']
    assert not sql(f"SELECT source_id FROM slop_gallery_sources s JOIN slop_processes p ON p.id=s.process_id WHERE p.batch_id='{bid}'")
    # The idea of the accepted SLOP is used; the idea of the failed proposal stays available.
    states={r['id']:sql(f"SELECT status FROM real_ideas WHERE id='{r['idea']['id']}'")[0]['status'] for r in selected['references']}
    assert states=={selected['references'][0]['id']:'used', selected['references'][1]['id']:'approved'},states
    used=call('/'+selected['references'][0]['id'],library=True)[1]['ideas']
    assert [i['state'] for i in used if i['id']==selected['references'][0]['idea']['id']]==['used'],used
    assert call('/ideas/'+selected['references'][0]['idea']['id'],{'idea':'x'},method='PATCH',library=True)[0]==409
    assert not sql("SELECT name FROM sqlite_schema WHERE name='slop_reference_uses'")
    saved=json.dumps(call('batches/'+bid)[1])
    assert all(r['id'] not in saved and r['title'] not in saved for r in selected['references'])
    assert call('/'+two['id'],library=True)[1]['status']=='published'

    # With exactly ten published REAL, one catalogue photo withdrawn makes a new game ineligible.
    # The original remains available to the game after generation and after changing gallery.
    catalogue=publish(LIBRARY, TOKEN, 'gallery-play', real=9, slop=10, seed=157)
    with urllib.request.urlopen(BASE+'/api/levels') as response:
        assert json.load(response)['levels'][0]['available']
    call('/'+two['id']+'/withdraw',{},library=True)
    with urllib.request.urlopen(BASE+'/api/levels') as response:
        assert not json.load(response)['levels'][0]['available']
    call('/'+two['id']+'/publish',{},library=True)
    remove_catalog(LIBRARY,TOKEN,catalogue); catalogue=[]
    # Moving an undecided SLOP keeps the generation snapshot but frees the source gallery's review.
    code, moved = call('/bulk', {'action': 'gallery', 'ids': [child['id']], 'gallery_id': other['id']}, library=True)
    assert code == 200 and moved == {'done': 1, 'failed': []}, moved
    moved = call('/'+child['id'], library=True)[1]
    assert moved['status'] == 'new' and moved['gallery_id'] == other['id'] and moved['generation'] == generated['generation']
    assert call('batches/'+bid)[1]['images'] == []
    assert call('auto')[1]['batch'] is None
    remove([child['id']])
    assert {r['id'] for r in extract(gallery,2)[1]['references']}=={one['id'],two['id']}

    # Changing the gallery after proposals prevents confirmation. Cancel drops references and cannot be replayed.
    control([])
    selected=extract(gallery,1)[1]; assert prepare(selected)[0]==200
    review=wait_for_batch()
    gallery=update_gallery(gallery,description+' Preferisci luce naturale.')
    assert call('auto')[1]['batch']['proposal_review']['invalid']
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409
    assert call('auto/cancel',{'batch':review['id']})[0]==200
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409 and image_count()==0
    assert prepare(selected)[0]==409  # the same extraction cannot be reused

    # Moving a REAL after proposal preparation invalidates the whole snapshot.
    control([])
    selected=extract(gallery,1)[1]; assert prepare(selected)[0]==200
    review=wait_for_batch()
    reference=call('/'+selected['references'][0]['id'],library=True)[1]
    moved=assign_gallery(reference,other['id'])
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409 and image_count()==0
    assign_gallery(moved,gallery['id'])
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409  # the revision still changed
    assert call('auto/cancel',{'batch':review['id']})[0]==200

    # Cancel while the first call is in flight: do not send the next prompt or any image.
    control([{'delay':1.2}])
    assert prepare(extract(gallery,2)[1])[0]==200
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

    # An uncertain call is resolved as uncertain without resends, even when the owner resumes remaining drafts.
    control([{'status':503}])
    assert prepare(extract(gallery,1)[1])[0]==200
    review=wait_for_batch(); assert review['processes'][0]['state']=='uncertain'
    assert call('auto/resume',{'confirm':True})[0]==409 and len(control())==1
    sql(f"UPDATE slop_batches SET gallery_expires=0 WHERE id='{review['id']}'")
    state=call('auto')[1]; assert state['expired'] and state['batch'] is None
    assert call('auto/start',{'batch':review['id'],'count':1,'confirm':True})[0]==409
    assert len(control())==1 and not sql("SELECT source_id FROM slop_gallery_sources")

finally:
    if catalogue:remove_catalog(LIBRARY,TOKEN,catalogue)
    remove(photos)
    call('/settings',old,method='PUT',library=True)

print('Gallery API: assignment, readiness, paid confirmations, whole images, revisions, privacy, and reuse passed.')
