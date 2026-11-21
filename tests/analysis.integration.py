"""Models and model contexts against a local Worker and the fake OpenAI (never the real one), after the retirement of the paid
analysis of the REAL (owner decisions of 2026-11-20: no tags, no editorial description, no description of the SLOP): the old routes
answer 404, the photo fields are gone, the source description of a REAL stays editable, the three contexts keep their versions and
the model selectors their checks. No paid call is made here."""
from local_db import sql
import io
import json
import os
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
    picture = Image.new('RGB', (48, 32), (len(title) * 9 % 256, 120, 60)); source = io.BytesIO(); picture.save(source, 'PNG')
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
    status, result = patch(item, change); assert status == 400 and 'Campi non previsti' in result['error'], result
assert call(f'{API}?' + urllib.parse.urlencode({'gallery': gallery_id, 'q': 'maggio 1968'}))[1]['items'][0]['id'] == real['id']
for item in (real, slop):
    call(f'{API}/{item["id"]}/trash', {}); assert call(f'{API}/{item["id"]}', method='DELETE')[1]['deleted'] == 1

# Model context: three parts with the approved first versions; each save is a version; restore. The base and the gallery prompt
# start from the proposals saved by migration 0066; the retired «Descrizione delle REAL» is not offered any more.
status, contexts = call(f'{API}/contexts'); assert status == 200 and contexts['max'] == 4000, contexts
parts = {p['part']: p for p in contexts['parts']}
assert set(parts) == {'base', 'slop_gallery_prompt', 'slop_evaluation'} and all(len(p['history']) == 1 for p in parts.values()), contexts
assert all(p['proposed'] is None for p in parts.values()), 'the current texts are the proposals of the code'
base_text = parts['base']['current']['body']
assert base_text.startswith('Lavori per un archivio fotografico italiano.') and 'Tag' not in base_text and 'descri' not in base_text, base_text
assert 'titolo e la descrizione della fonte' in parts['slop_gallery_prompt']['current']['body']
assert 'profilo editoriale' not in parts['slop_gallery_prompt']['current']['body']
assert 'credibilità fotografica' in parts['slop_evaluation']['current']['body'], parts
assert 'used' not in parts['base']['history'][0]
for wrong in ({'part': 'analysis', 'body': 'x'}, {'part': 'other', 'body': 'x'}, {'part': 'base', 'body': '   '}, {'part': 'base', 'body': 'x' * 4001},
              {'part': 'base'}, {'part': 'base', 'body': 'x', 'extra': 1}):
    assert call(f'{API}/contexts', wrong)[0] == 400, wrong
assert call(f'{API}/contexts/restore', {'id': 'missing'})[0] == 404
# An old version of the retired part cannot come back.
sql("INSERT INTO model_contexts(id,part,body,created_at) VALUES('retired-analysis','analysis','Descrizione delle REAL','2026-11-19T10:00:00.000Z')")
assert call(f'{API}/contexts/restore', {'id': 'retired-analysis'})[0] == 409
first = parts['base']['current']
custom = first['body'] + '\nContesto di prova 42.'
status, contexts = call(f'{API}/contexts', {'part': 'base', 'body': custom + '\r\n'}); assert status == 200
part = next(p for p in contexts['parts'] if p['part'] == 'base')
assert part['current']['body'] == custom and len(part['history']) == 2 and part['proposed'] == first['body'], part
assert len(next(p for p in call(f'{API}/contexts', {'part': 'base', 'body': custom})[1]['parts'] if p['part'] == 'base')['history']) == 2  # unchanged text: no new version
status, contexts = call(f'{API}/contexts/restore', {'id': first['id']}); assert status == 200
part = next(p for p in contexts['parts'] if p['part'] == 'base')
assert part['current']['body'] == first['body'] and len(part['history']) == 3, part

# Model selectors in Settings: lists from the code, availability from the OpenAI project.
code, models = call(f'{API}/models'); assert code == 200 and models['text_model'] == 'gpt-6.1-sol' and models['image_model'] == 'gpt-image-2.5-flare', models
available = {m['id']: m['available'] for m in models['image_models']}
assert available['gpt-image-2'] is True and available['gpt-image-2.5-flare'] is True and available['gpt-image-2.6-flare'] is False, available
assert len(models['text_models']) == 27 and all(m['available'] for m in models['text_models'])
assert dict((m['id'], m['qualities']) for m in models['image_models'])['gpt-image-2.5-flare'][-1] == 'max'
assert {m['id']: m['shutdown'] for m in models['image_models']}['gpt-image-2'] == '2027-02-10'
for change, code_wanted in (({'image_model': 'gpt-image-2.6-flare'}, 409), ({'text_model': 'gpt-9'}, 400), ({'image_model': 'dall-e-3'}, 400), ({}, 400), ({'other': 'x'}, 400)):
    assert call(f'{API}/models', change, method='PUT')[0] == code_wanted, change
code, models = call(f'{API}/models', {'image_model': 'gpt-image-2', 'text_model': 'gpt-5-mini'}, method='PUT')
assert code == 200 and models['image_model'] == 'gpt-image-2' and models['text_model'] == 'gpt-5-mini', models
assert call(f'{API}/models', {'text_model': 'gpt-6.1-sol', 'image_model': 'gpt-image-2.5-flare'}, method='PUT')[0] == 200
assert openai() == []
print('Analysis integration passed: no paid analysis or description of the REAL, no description of the SLOP, three model contexts with versions, model selectors.')
