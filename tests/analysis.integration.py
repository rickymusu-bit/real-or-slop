"""Model settings, REAL measures, ideas and visual descriptions against a local Worker and fake OpenAI.
The legacy analysis routes remain retired. The source description is editable independently of the visual description."""
from local_db import sql
from concurrent.futures import ThreadPoolExecutor
import base64
import hashlib
import io
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image
from catalog import make_gallery

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
fake = os.environ['ROS_TEST_FAKE_OPENAI']; assert fake.startswith('http://127.0.0.1:')
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
gallery_id = make_gallery(base + '/api/admin/library', token, 'Test analysis')
API = base + '/api/admin/library'

def call(url, data=None, method=None, raw=None, mime='application/json'):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': mime, 'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def openai(queue=None):
    """Sets the fake model's next answers (and clears its log), or returns the requests it received."""
    req = urllib.request.Request(fake + '/control', data=json.dumps({'queue': queue}).encode() if queue is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read()).get('log')
def upload(origin, title='', **params):
    picture = Image.new('RGB', (48, 32), tuple(hashlib.sha256(title.encode()).digest()[:3])); source = io.BytesIO(); picture.save(source, 'PNG')
    status, item = call(f'{API}/upload?' + urllib.parse.urlencode({'gallery_id': gallery_id, 'origin': origin, 'title': title, **params}),
                        raw=source.getvalue(), mime='image/png')
    assert status == 201, item
    return item
def patch(item, change):
    return call(f'{API}/{item["id"]}', {'revision': item['revision'], **change}, method='PATCH')

# The paid analysis of the REAL is gone: no route, no fields, no call.
openai([])
real = upload('REAL', 'Place de la République, 1968', description='Manifestanti e polizia in place de la République.')
slop = upload('SLOP', prompt='A street at dusk.', description='Nota che non viene salvata.', model='gpt-image-2')
for path, body in ((f'/{real["id"]}/analyze', {'confirm': True}), ('/analysis', None), (f'/{real["id"]}/categories', {'confirm': True})):
    assert call(API + path, body, method='POST' if body else 'GET')[0] == 404, path
assert openai() == [] and sql('SELECT count(*) AS n FROM paid_calls')[0]['n'] == 0
for retired in ('real_description', 'real_description_provenance', 'commons_description', 'analysis', 'tags'):
    assert retired not in real and retired not in slop, retired
# A REAL keeps its source description, editable; a SLOP has prompt and model and no description.
assert real['description'] == 'Manifestanti e polizia in place de la République.', real
assert 'description' not in slop and slop['prompt'] == 'A street at dusk.' and slop['model'] == 'gpt-image-2', slop
assert sql(f"SELECT description FROM images WHERE id='{slop['id']}'")[0]['description'] == ''
status, real = patch(real, {'description': 'Corteo in place de la République, maggio 1968.'})
assert status == 200 and real['description'] == 'Corteo in place de la République, maggio 1968.', real
for item, change in ((real, {'real_description': {'visible': 'x', 'documented_context': ''}}), (slop, {'description': 'Nota'})):
    status, result = patch(item, change); assert status == 400 and 'Unexpected fields' in result['error'], result
assert call(f'{API}?' + urllib.parse.urlencode({'gallery': gallery_id, 'q': 'maggio 1968'}))[1]['items'][0]['id'] == real['id']
for item in (real, slop):
    call(f'{API}/{item["id"]}/trash', {}); assert call(f'{API}/{item["id"]}', method='DELETE')[1]['deleted'] == 1

# Model context: five parts with the approved first versions; each save is a version; restore. The base starts from the proposal saved
# by migration 0066, the gallery prompt from the one saved by 0070 over it; the retired «Descrizione delle REAL» is not offered any more.
status, contexts = call(f'{API}/contexts'); assert status == 200 and contexts['max'] == 4000, contexts
parts = {p['part']: p for p in contexts['parts']}
assert set(parts) == {'base', 'real_measure', 'real_ideas', 'slop_gallery_prompt', 'slop_evaluation'} and all(p['history'] for p in parts.values()), contexts
assert 'Detail' in parts['real_measure']['current']['body'] and 'people and anatomy' in parts['real_measure']['current']['body'], parts
assert all(p['proposed'] is None for k,p in parts.items() if k != 'real_ideas'), 'the current texts are the proposals of the code'
base_text = parts['base']['current']['body']
assert base_text.startswith('You work on a photographic archive.') and 'English' in base_text, base_text
assert 'title and source description' in parts['slop_gallery_prompt']['current']['body']
assert 'profilo editoriale' not in parts['slop_gallery_prompt']['current']['body'] and 'approved REAL idea' in parts['slop_gallery_prompt']['current']['body']
assert 'photographic credibility' in parts['slop_evaluation']['current']['body'], parts
assert 'used' not in parts['base']['history'][0]
for wrong in ({'part': 'analysis', 'body': 'x'}, {'part': 'other', 'body': 'x'}, {'part': 'base', 'body': '   '}, {'part': 'base', 'body': 'x' * 4001},
              {'part': 'base'}, {'part': 'base', 'body': 'x', 'extra': 1}):
    assert call(f'{API}/contexts', wrong)[0] == 400, wrong
assert call(f'{API}/contexts/restore', {'id': 'missing'})[0] == 404
# An old version of the retired part cannot come back.
sql("INSERT INTO model_contexts(id,part,body,created_at) VALUES('retired-analysis','analysis','Description delle REAL','2026-11-19T10:00:00.000Z')")
assert call(f'{API}/contexts/restore', {'id': 'retired-analysis'})[0] == 409
initial_history = len(parts['base']['history'])
first = parts['base']['current']
custom = first['body'] + '\nContesto di prova 42.'
status, contexts = call(f'{API}/contexts', {'part': 'base', 'body': custom + '\r\n'}); assert status == 200
part = next(p for p in contexts['parts'] if p['part'] == 'base')
assert part['current']['body'] == custom and len(part['history']) == initial_history + 1 and part['proposed'] == first['body'], part
assert len(next(p for p in call(f'{API}/contexts', {'part': 'base', 'body': custom})[1]['parts'] if p['part'] == 'base')['history']) == initial_history + 1  # unchanged text: no new version
status, contexts = call(f'{API}/contexts/restore', {'id': first['id']}); assert status == 200
part = next(p for p in contexts['parts'] if p['part'] == 'base')
assert part['current']['body'] == first['body'] and len(part['history']) == initial_history + 2, part

# Model selectors in Settings: lists from the code, availability from the OpenAI project.
code, models = call(f'{API}/models'); assert code == 200 and models['text_model'] == 'gpt-6.1-sol' and models['image_model'] == 'gpt-image-2.5-flare', models
available = {m['id']: m['available'] for m in models['image_models']}
assert available['gpt-image-2'] is True and available['gpt-image-2.5-flare'] is True and available['gpt-image-2.6-flare'] is False, available
assert {'gpt-6.2-sol', 'gpt-6.1-sol'} <= {m['id'] for m in models['text_models']} and all(m['available'] for m in models['text_models'])
assert dict((m['id'], m['qualities']) for m in models['image_models'])['gpt-image-2.5-flare'][-1] == 'max'
assert {m['id']: m['shutdown'] for m in models['image_models']}['gpt-image-2'] == '2027-02-10'
for change, code_wanted in (({'image_model': 'gpt-image-2.6-flare'}, 409), ({'text_model': 'gpt-9'}, 400), ({'image_model': 'dall-e-3'}, 400), ({}, 400), ({'other': 'x'}, 400)):
    assert call(f'{API}/models', change, method='PUT')[0] == code_wanted, change
code, models = call(f'{API}/models', {'image_model': 'gpt-image-2', 'text_model': 'gpt-5-mini'}, method='PUT')
assert code == 200 and models['image_model'] == 'gpt-image-2' and models['text_model'] == 'gpt-5-mini', models
assert call(f'{API}/models', {'text_model': 'gpt-6.1-sol', 'image_model': 'gpt-image-2.5-flare'}, method='PUT')[0] == 200
assert openai() == []

# Crowding and detail of a REAL: one confirmed paid call, the scores computed by the Worker, every measure kept.
import uuid
def measure(item, **extra):
    return call(f'{API}/{item["id"]}/measure', {'confirm': True, 'request': str(uuid.uuid4()), **extra})
def calls(): return sql("SELECT count(*) AS n FROM paid_calls WHERE kind='analysis'")[0]['n']
real = upload('REAL', 'Game Boy su una scrivania')
slop = upload('SLOP', prompt='A handheld console.', model='gpt-image-2')
assert real['measure'] is None and 'measure' not in slop
openai([])
for wrong in ({}, {'confirm': True}, {'confirm': False, 'request': str(uuid.uuid4())}, {'confirm': True, 'request': 'x'},
              {'confirm': True, 'request': str(uuid.uuid4()), 'other': 1}):
    assert call(f'{API}/{real["id"]}/measure', wrong)[0] == 400, wrong
assert measure(slop)[0] == 409 and openai() == [] and calls() == 0
status, measured = measure(real)
assert status == 201, measured
m = measured['measure']
assert (m['crowdedness'], m['detail'], m['objects'], m['model'], m['formula']) == (29, 38, 2, 'gpt-6.1-sol', 2), m
assert m['limits'] == {'crowdedness': 67, 'detail': 100} and m['over'] == [], m
sent = openai()
assert len(sent) == 1 and sent[0]['body']['text']['format']['name'] == 'real_measure', sent
body = sent[0]['body']
assert body['input'][0]['content'][1]['image_url'].startswith('data:image/png;base64,') and body['input'][0]['content'][1]['detail'] == 'high'
assert json.loads(body['input'][0]['content'][0]['text']) == {'gallery': {'title': 'Test analysis', 'description': ''}}, body['input'][0]['content'][0]
assert 'Other objects' in body['instructions'] and body['instructions'].startswith('You work on a photographic archive.')
assert calls() == 1 and sql("SELECT image_id FROM paid_calls WHERE kind='analysis'")[0]['image_id'] == real['id']
# The same confirmation sent twice reaches the model once.
request = str(uuid.uuid4())
assert call(f'{API}/{real["id"]}/measure', {'confirm': True, 'request': request})[0] == 201
assert call(f'{API}/{real["id"]}/measure', {'confirm': True, 'request': request})[0] == 409 and calls() == 2
# Every measure is kept, the latest first, with the objects the model saw and the context versions.
history = call(f'{API}/{real["id"]}/measures')[1]['measures']
assert len(history) == 2 and history[0]['observation']['subject']['name'] == 'Game Boy' and len(history[0]['observation']['others']) == 2, history
measure_context = next(p for p in call(f'{API}/contexts')[1]['parts'] if p['part'] == 'real_measure')['current']['id']
assert history[0]['measure_context'] == measure_context and history[0]['base_context'], history[0]
# Thresholds: the gallery's own, else the defaults of the settings; a gallery's thresholds never change its revision.
gallery = call(f'{API}/galleries/{gallery_id}')[1]
assert gallery['max_crowdedness'] is None and gallery['max_detail'] is None
listing = call(f'{API}/galleries')[1]
assert listing['thresholds'] == {'crowdedness': 67, 'detail': 100}, listing['thresholds']
edit = {'title': gallery['title'], 'description': gallery['description'], 'revision': gallery['revision']}
assert 'slop_instructions' not in gallery and call(f'{API}/galleries/{gallery_id}', {**edit, 'slop_instructions': 'x'}, method='PATCH')[0] == 400
assert call(f'{API}/galleries/{gallery_id}/suggest', {'confirm': True, 'request': str(uuid.uuid4()), 'revision': gallery['revision']})[0] == 404
for wrong in (101, -1, 2.5, '50'):
    assert call(f'{API}/galleries/{gallery_id}', {**edit, 'max_crowdedness': wrong}, method='PATCH')[0] == 400, wrong
status, changed = call(f'{API}/galleries/{gallery_id}', {**edit, 'max_crowdedness': 20, 'max_detail': 30}, method='PATCH')
assert status == 200 and (changed['max_crowdedness'], changed['max_detail'], changed['revision']) == (20, 30, gallery['revision']), changed
m = call(f'{API}/{real["id"]}')[1]['measure']
assert m['over'] == ['crowdedness', 'detail'] and m['limits'] == {'crowdedness': 20, 'detail': 30}, m
assert next(i for i in call(f'{API}?' + urllib.parse.urlencode({'gallery': gallery_id}))[1]['items'] if i['id'] == real['id'])['measure']['over'] == ['crowdedness', 'detail']
status, changed = call(f'{API}/galleries/{gallery_id}', {**edit, 'max_crowdedness': None, 'max_detail': None}, method='PATCH')
assert status == 200 and changed['max_crowdedness'] is None and changed['revision'] == gallery['revision'], changed
assert call(f'{API}/settings', {'crowdedness_threshold': 28}, method='PUT')[0] == 200
for wrong in ({'crowdedness_threshold': 101}, {'detail_threshold': -1}):
    assert call(f'{API}/settings', wrong, method='PUT')[0] == 400, wrong
m = call(f'{API}/{real["id"]}')[1]['measure']
assert m['over'] == ['crowdedness'] and m['limits'] == {'crowdedness': 28, 'detail': 100}, m
assert call(f'{API}/settings', {'crowdedness_threshold': 67}, method='PUT')[0] == 200
# A measure of the first formula (six kinds, present or not) still reads, and says which formula it used.
sql(f"""INSERT INTO real_measures(id,image_id,model,base_context,measure_context,observation,crowdedness,detail,created_at,formula)
  VALUES('formula-1','{real['id']}','gpt-6.1-sol','b','m','{{"subject":{{"name":"console","box":{{"x":0,"y":0,"width":1,"height":1}},"detail":{{"text":true}}}},"others":[],"unlisted":0}}',0,100,'2000-01-01T00:00:00.000Z',1)""")
history = call(f'{API}/{real["id"]}/measures')[1]['measures']
assert history[-1]['id'] == 'formula-1' and history[-1]['formula'] == 1 and history[0]['formula'] == 2, history
# Failures: an unreadable or malformed answer stores nothing; a server error is uncertain and never repeated.
before = len(call(f'{API}/{real["id"]}/measures')[1]['measures'])
openai([{'garbage': True}, {'json': {'subject': {'name': 'x'}, 'others': [], 'unlisted': 0}}, {'status': 500}])
assert measure(real)[0] == 502 and measure(real)[0] == 502
status, result = measure(real); assert status == 502 and 'ncertain' in result['error'], result
assert len(openai()) == 3 and len(call(f'{API}/{real["id"]}/measures')[1]['measures']) == before
assert sql("SELECT status FROM paid_calls WHERE kind='analysis' ORDER BY created_at DESC LIMIT 1")[0]['status'] == 'uncertain'
# A photo in the trash is not measured; deleting it deletes its measures.
call(f'{API}/{real["id"]}/trash', {})
assert measure(real)[0] == 409
assert call(f'{API}/{real["id"]}', method='DELETE')[1]['deleted'] == 1
assert sql(f"SELECT count(*) AS n FROM real_measures WHERE image_id='{real['id']}'")[0]['n'] == 0
call(f'{API}/{slop["id"]}/trash', {}); call(f'{API}/{slop["id"]}', method='DELETE')

# Ideas of falsification (owner decisions of 2026-11-21): one confirmed call, at most three per REAL, approved by the owner.
def ideas(item, **extra):
    return call(f'{API}/{item["id"]}/ideas', {'confirm': True, 'request': str(uuid.uuid4()), **extra})
def edit_idea(idea_id, change, method='PATCH'):
    return call(f'{API}/ideas/{idea_id}', change, method=method)
real = upload('REAL', 'Game Boy per le idee di falsificazione')
slop = upload('SLOP', prompt='A console on a desk.', model='gpt-image-2')
assert real['ideas'] == [] and real['ideas_reason'] == '' and 'ideas' not in slop
openai([])
for wrong in ({}, {'confirm': True}, {'confirm': False, 'request': str(uuid.uuid4())}, {'confirm': True, 'request': str(uuid.uuid4()), 'n': 2}):
    assert call(f'{API}/{real["id"]}/ideas', wrong)[0] == 400, wrong
assert ideas(slop)[0] == 409 and openai() == []
calls_before = sql("SELECT count(*) AS n FROM paid_calls WHERE kind='prompts'")[0]['n']
status, item = ideas(real)
assert status == 201 and [i['state'] for i in item['ideas']] == ['proposed', 'proposed'] and not any(i['busy'] for i in item['ideas']), item
sent = openai(); body = sent[0]['body']
assert len(sent) == 1 and body['text']['format']['name'] == 'real_ideas' and body['input'][0]['content'][1]['detail'] == 'high'
given = json.loads(body['input'][0]['content'][0]['text'])
assert given['ideas_wanted'] == 3 and given['existing_ideas'] == [] and given['levels'] is None, given
assert given['reference'] == {'title': 'Game Boy per le idee di falsificazione', 'description': ''} and given['gallery'] == {'title': 'Test analysis', 'description': ''}, given
assert 'never copied' in body['instructions'] and 'Invent any people' in body['instructions']
assert sql("SELECT count(*) AS n FROM paid_calls WHERE kind='prompts'")[0]['n'] == calls_before + 1
first, second = item['ideas']
for wrong in ({}, {'idea': ''}, {'approve': False}, {'other': 1}, {'idea': 'x' * 601}, {'genre': 'x' * 161}):
    assert edit_idea(first['id'], wrong)[0] == 400, wrong
status, item = edit_idea(first['id'], {'approve': True}); assert status == 200 and item['ideas'][0]['state'] == 'approved', item
status, item = edit_idea(second['id'], {'idea': 'Una console in uso su un treno.', 'genre': 'Foto amatoriale'})
assert status == 200 and (item['ideas'][1]['idea'], item['ideas'][1]['genre'], item['ideas'][1]['state']) == ('Una console in uso su un treno.', 'Foto amatoriale', 'proposed'), item
# A new proposal replaces the proposed ideas, keeps the approved one and asks only for the missing two.
openai([])
status, item = ideas(real); assert status == 201 and [i['state'] for i in item['ideas']] == ['approved', 'proposed', 'proposed'], item
given = json.loads(openai()[0]['body']['input'][0]['content'][0]['text'])
assert given['ideas_wanted'] == 2 and [e['idea'] for e in given['existing_ideas']] == [first['idea']], given
for idea in item['ideas'][1:]: edit_idea(idea['id'], {'approve': True})
status, refused = ideas(real); assert status == 409 and 'already has 3' in refused['error'], refused
# Editing the gallery leaves the ideas as they are; moving the REAL to another gallery makes them to review, and approving one again
# makes it available there.
gallery = call(f'{API}/galleries/{gallery_id}')[1]
assert call(f'{API}/galleries/{gallery_id}', {'title': gallery['title'], 'description': 'Console portatili', 'revision': gallery['revision']}, method='PATCH')[0] == 200
assert [i['state'] for i in call(f'{API}/{real["id"]}')[1]['ideas']] == ['approved'] * 3
item = call(f'{API}/{real["id"]}')[1]
status, item = patch(item, {'gallery_id': make_gallery(API, token, 'Altra galleria delle idee')})
assert status == 200 and [i['state'] for i in item['ideas']] == ['review'] * 3, item
status, item = edit_idea(item['ideas'][0]['id'], {'approve': True}); assert [i['state'] for i in item['ideas']] == ['approved', 'review', 'review'], item
status, item = edit_idea(item['ideas'][2]['id'], {}, method='DELETE'); assert status == 200 and len(item['ideas']) == 2, item
# No idea: the reason stays with the REAL; a malformed answer saves nothing.
openai([{'json': {'ideas': [], 'reason': 'Edizione unica in un contesto irripetibile.'}}, {'json': {'ideas': [{'idea': ''}], 'reason': ''}}])
status, item = ideas(real); assert status == 201 and item['ideas_reason'] == 'Edizione unica in un contesto irripetibile.' and len(item['ideas']) == 2, item
assert ideas(real)[0] == 502 and len(call(f'{API}/{real["id"]}')[1]['ideas']) == 2
# A REAL in the trash gets no ideas; deleting it deletes them.
call(f'{API}/{real["id"]}/trash', {})
assert ideas(real)[0] == 409
assert call(f'{API}/{real["id"]}', method='DELETE')[1]['deleted'] == 1
assert sql(f"SELECT count(*) AS n FROM real_ideas WHERE image_id='{real['id']}'")[0]['n'] == 0
call(f'{API}/{slop["id"]}/trash', {}); call(f'{API}/{slop["id"]}', method='DELETE')

# Visual descriptions: original image, separate source field, one call even under concurrent requests.
real = upload('REAL', 'Game Boy DMG-01 da descrivere', description='Title riportato dalla fonte.')
trash = upload('REAL', 'Foto da lasciare in Trash')
slop = upload('SLOP', prompt='Plausible console.', model='gpt-image-2')
call(f'{API}/{trash["id"]}/trash', {})
missing = f'{API}/undescribed-reals?gallery={gallery_id}'
describe = f'{API}/{real["id"]}/description'
confirm = {'confirm': True, 'request': str(uuid.uuid4()), 'gallery_id': gallery_id}
assert real['visual_description'] is None and not real['has_visual_description'] and 'visual_description' not in slop
assert call(missing)[1]['images'] == [{'id': real['id'], 'title': real['title']}]
openai([])
assert call(describe, {**confirm, 'confirm': False})[0] == 400
assert call(describe, {**confirm, 'gallery_id': 'wrong-gallery'})[0] == 409
for item in (slop, trash): assert call(f'{API}/{item["id"]}/description', confirm)[0] == 409
assert openai() == []
openai([{'json': {'subject': ''}}])
assert call(describe, confirm)[0] == 502 and call(missing)[1]['images']
assert call(describe, confirm)[0] == 409 and len(openai()) == 1
openai([{'delay': 1}])
with ThreadPoolExecutor(1) as pool:
    pending = pool.submit(call, describe, {**confirm, 'request': str(uuid.uuid4())})
    for _ in range(50):
        if openai(): break
        time.sleep(0.02)
    assert call(describe, {**confirm, 'request': str(uuid.uuid4())})[0] == 409
    status, described = pending.result()
assert status == 200 and len(openai()) == 1 and call(missing)[1]['images'] == [], described
assert described['has_visual_description'] and described['description'] == real['description'] and described['revision'] == real['revision']
assert described['visual_description']['sections']['viewpoint'] == 'Front view.'
assert described['visual_description']['indications']['museum_or_catalog'] == {'applies': True, 'reason': 'Neutral background.'}
assert described['visual_description']['model'] == openai()[0]['body']['model'] and described['visual_description']['base_context']
body = openai()[0]['body']; sent = body['input'][0]['content']
assert body['text']['format']['name'] == 'real_visual_description' and sent[1]['detail'] == 'high'
assert 'Write all generated text in English' in body['instructions'] and 'in its original language' in body['instructions']
assert json.loads(sent[0]['text'])['source']['description'] == real['description']
request = urllib.request.Request(base + real['original'], headers={'Authorization': 'Bearer ' + token})
with urllib.request.urlopen(request) as f: assert base64.b64decode(sent[1]['image_url'].split(',', 1)[1]) == f.read()
listed = call(f'{API}?gallery={gallery_id}&origin=REAL')[1]
assert listed['undescribed'] == 0 and listed['items'][0]['has_visual_description'] and 'visual_description' not in listed['items'][0]
assert call(describe, confirm)[0] == 200 and len(openai()) == 1

# Retired index routes cannot start paid calls; descriptions remain usable without subject lookup fields.
assert 'subject' not in described['visual_description']
assert 'unindexed' not in listed
openai([])
for path, data in ((f'/real-index?gallery={gallery_id}&model=DMG-01', None),
                   (f'/real-index/pending?gallery={gallery_id}', None),
                   (f'/{real["id"]}/index-description', {**confirm, 'max_calls': 2})):
    assert call(API + path, data)[0] == 404, path
assert openai() == []
for item in (real, slop, trash):
    call(f'{API}/{item["id"]}/trash', {}); call(f'{API}/{item["id"]}', method='DELETE')
print('Analysis integration passed: model settings, measures, ideas, visual descriptions; retired indexing makes no calls.')
