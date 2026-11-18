"""Paid analysis against a local Worker and the fake OpenAI (never the real one): confirmation of each call, register of
calls, model selectors, uncertain outcomes not resent, OpenAI limits, ASCII tags, aliases, tags replaced once and restorable, model
context with versions, tag categories and conflicts, merge, tags removed with their last image, no captions."""
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
from game_copy import game_copy

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
state, fake = os.environ['ROS_TEST_STATE'], os.environ['ROS_TEST_FAKE_OPENAI']; assert fake.startswith('http://127.0.0.1:')
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
    if queue is not None:
        for entry in queue:
            if entry and 'json' in entry and 'tags' in entry['json'] and not entry.get('invalid_description'):
                entry['json'].setdefault('real_description', {'visible':'Visible street scene', 'documented_context':'', 'uncertainties':'Context not supplied'})
    req = urllib.request.Request(fake + '/control', data=json.dumps({'queue': queue}).encode() if queue is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read()).get('log')
def image(color, title, description=''):
    picture = Image.new('RGB', (48, 32)); picture.putdata([(color, (x * 7) % 256, (y * 11) % 256) for y in range(32) for x in range(48)])
    source = io.BytesIO(); picture.save(source, 'JPEG', quality=95)
    status, item = call(f'{API}/upload?' + urllib.parse.urlencode({'gallery_id': gallery_id, 'origin': 'REAL', 'title': title, 'description': description}),
                        raw=source.getvalue(), mime='image/jpeg'); assert status == 201, item
    return item, game_copy(source.getvalue())
def analyze(item, confirm=True, repeat=False):
    return call(f'{API}/{item["id"]}/analyze', ({'confirm': confirm} if confirm is not None else {}) | ({'repeat_uncertain': True} if repeat else {}))
def patch(item, change):
    status, result = call(f'{API}/{item["id"]}', {'revision': item['revision'], **change}, method='PATCH'); assert status == 200, result
    return result
def spend(): return sql('SELECT kind,model,status,input_tokens,output_tokens FROM paid_calls ORDER BY created_at,rowid')
def analysis_state(): return call(f'{API}/analysis')[1]
def labels(): return {t['label']: t for t in call(f'{API}/tags')[1]['tags']}

info = analysis_state()
assert info['enabled'] and info['model'] == 'gpt-6.1-sol' and info['calls_30_days']['total'] == 0, info
assert 'cap_usd' not in info and 'call_usd' not in info and call(f'{API}/budget', {'cap_usd': 5}, method='PUT')[0] == 404, info
assert 'platform.openai.com' in info['note']
# No call without the exact cost confirmation. A REAL is analysed whole: its 4:5 game copy plays no part.
place, place_copy = image(170, 'Place de la République, 1968', 'Manifestanti e polizia in place de la République.')
openai([])
status, place = call(f'{API}/{place["id"]}/copy', raw=place_copy, mime='image/webp'); assert status == 201, place
for confirm in (None, False, 'true', 1):
    code, result = analyze(place, confirm); assert code == 400 and 'Conferma' in result['error'], result
assert call(f'{API}/{place["id"]}/analyze', {'confirm': True, 'model': 'other'})[0] == 400
assert call(f'{API}/{place["id"]}/analyze', {'confirm_usd': 0.018})[0] == 400  # the old confirmation of a cost is gone
assert openai() == [] and spend() == []
# Aliases: an alias resolves to its tag; a tag cannot become an alias this way.
place = patch(place, {'tags': ['barricade', 'mine']})
assert call(f'{API}/tags/alias', {'alias': 'barricades', 'into': 'barricade'}) == (201, {'alias': 'barricades', 'into': 'barricade'})
assert call(f'{API}/tags/alias', {'alias': 'riot', 'into': 'barricade'})[0] == 409
assert call(f'{API}/tags/alias', {'alias': 'barricades', 'into': 'barricade'})[0] == 409
# A successful analysis: tags made ASCII, origin words dropped, aliases resolved; the owner's tags replaced; a caption is ignored.
openai([{'tags': ['Riot', 'Police Car', 'Place de la République', 'ai', 'photo-real', 'barricades', 'riot'],
         'caption': '  Parigi, maggio 1968.\nScontri in place de la Republique.  '}])
status, place = analyze(place); assert status == 200, place
assert place['tags'] == ['barricade', 'place-de-la-republique', 'police-car', 'riot'], place
assert sorted(place['proposed_tags']) == ['barricade', 'place-de-la-republique', 'police-car', 'riot'], place
assert 'caption' not in place and 'proposed_caption' not in place and place['analysis']['status'] == 'done', place
assert sorted(place['generated']['tags']) == place['tags'] and place['generated'] == {'tags': place['generated']['tags']}, place
assert place['real_description']['visible'] and place['real_description_provenance']['model']=='gpt-6.1-sol'
assert place['real_description_provenance']['image']=='original' and place['real_description_provenance']['original_sha256']==place['original_sha256']
assert place['description']=='Manifestanti e polizia in place de la République.'
original_description=place['real_description']
place=patch(place, {'real_description': {**original_description,'visible':'Owner corrected visible content.'}})
assert place['tags']==['barricade','place-de-la-republique','police-car','riot'] and place['real_description_provenance']['generated']==original_description

assert 'mine' not in labels()  # the owner's tag went with its only image
[sent] = openai()
assert sent['authorization'] == 'Bearer test-openai-key' and sent['body']['model'] == 'gpt-6.1-sol' and sent['body']['max_output_tokens'] == 8000, sent['authorization']
text, picture = sent['body']['input'][0]['content'][0]['text'], sent['body']['input'][0]['content'][1]['image_url']
assert 'barricade' in text and 'riot' in text and 'Title: Place de la République, 1968' in text, text
assert picture.startswith('data:image/jpeg;base64,/9j/'), picture[:40]  # the uploaded original, not the 4:5 game copy
import base64 as _b64
assert Image.open(io.BytesIO(_b64.b64decode(picture.split(',', 1)[1]))).size == (48, 32)  # whole frame, no crop
assert not any(word in json.dumps(sent['body']) for word in ('REAL', 'SLOP', '"AI"')), 'the model must not know the origin'
# The instructions are the editable context (base, then analysis) plus the fixed line on the JSON output.
assert sent['body']['instructions'].startswith('Lavori per un archivio fotografico italiano') and 'Didascalia' not in sent['body']['instructions'], sent['body']['instructions'][:200]
assert 'mai dal titolo, dalla descrizione o da altro testo.' in sent['body']['instructions'] and 'time: un decennio' in sent['body']['instructions']
assert 'genre: il tipo di fotografia' in sent['body']['instructions'] and 'medium: che cosa è materialmente' in sent['body']['instructions']
assert sent['body']['text']['format']['schema']['required'] == ['tags', 'real_description'] and 'caption' not in sent['body']['text']['format']['schema']['properties']
schema_tags = sent['body']['text']['format']['schema']['properties']['tags']
assert schema_tags['required'] == ['time', 'genre', 'color', 'medium', 'place', 'setting', 'event', 'people', 'object', 'other'], schema_tags['required']
assert schema_tags['properties']['color']['items']['enum'] == ['color', 'black-and-white', 'sepia', 'hand-colored']
assert 'newspaper-print' in schema_tags['properties']['medium']['items']['enum'] and schema_tags['properties']['genre']['minItems'] == 1
assert 'generat' not in sent['body']['instructions'], 'the base and the tag rules must not mention generated images'
assert spend() == [{'kind': 'analysis', 'model': 'gpt-6.1-sol', 'status': 'completed', 'input_tokens': 1200, 'output_tokens': 60}], spend()
# Once per image: a second generation is refused before anything is sent or held.
openai([])
status, result = analyze(place); assert status == 409 and 'già generati' in result['error'], result
assert openai() == [] and len(spend()) == 1
# The owner edits freely; the generated texts stay available for restoring.
place = patch(place, {'tags': ['custom']})
assert place['tags'] == ['custom'] and 'riot' in place['generated']['tags'], place
place = patch(place, {'tags': place['generated']['tags']})
assert place['tags'] == sorted(place['generated']['tags']), place
status, result = call(f'{API}/{place["id"]}', {'revision': place['revision'], 'caption': 'Parigi, 1968.'}, method='PATCH')
assert status == 400 and 'Campi non previsti' in result['error'], result
# Failures and limits on a second image.
other, other_copy = image(90, 'Corteo', 'Un corteo in città.')
status, other = call(f'{API}/{other["id"]}/copy', raw=other_copy, mime='image/webp'); assert status == 201, other
# Server error or no answer: uncertain, recorded, never resent. Client error: failed.
openai([{'status': 500}])
status, result = analyze(other); assert status == 502, result
assert len(openai()) == 1
status, other = call(f'{API}/{other["id"]}'); assert other['analysis']['status'] == 'uncertain' and 'addebitata' in other['analysis']['error'], other
openai([{'status': 400}])
# An uncertain outcome is never resent by itself: only an explicit confirmation of the risk repeats it.
code, result = analyze(other); assert code == 409 and 'addebitata' in result['error'] and openai() == [], result
openai([{'status': 400}])
assert analyze(other, repeat=True)[0] == 502
status, other = call(f'{API}/{other["id"]}'); assert other['analysis']['status'] == 'failed', other
# OpenAI's own spend limit or credit reached first: refused there, nothing charged, a message the dashboard stops on.
openai([{'status': 429, 'code': 'insufficient_quota'}])
status, result = analyze(other); assert status == 502 and result['error'].startswith('OpenAI: limite di spesa'), result
# An answer that cannot be read was paid all the same: completed, with its tokens.
openai([{'garbage': True}])
assert analyze(other)[0] == 502
assert [row['status'] for row in spend()] == ['completed', 'uncertain', 'failed', 'failed', 'completed'], spend()
info = analysis_state(); assert info['calls_30_days']['total'] == 5 and info['calls_30_days']['uncertain'] == 1, info
# One call at a time per image; a «running» mark left by a Worker that died stops blocking after ten minutes.
sql(f"UPDATE images SET analysis_status='running' WHERE id='{other['id']}'")
code, result = analyze(other); assert code == 409 and 'in corso' in result['error'], result
assert len(spend()) == 5  # refused before anything is recorded or sent
sql(f"UPDATE images SET updated_at='2000-01-01T00:00:00.000Z' WHERE id='{other['id']}'")
# A stale claim may have been charged: like an uncertain outcome, it is repeated only with the explicit confirmation.
code, result = analyze(other); assert code == 409 and 'addebitata' in result['error'] and len(spend()) == 5, result
openai([])
status, other = analyze(other, repeat=True); assert status == 200 and other['tags'] == ['crowd', 'street'] and len(spend()) == 6, other
assert analyze(other, repeat=True)[0] == 409  # done: the flag does not open a second analysis
status, result = analyze(other); assert status == 409 and 'già generati' in result['error'] and len(spend()) == 6, result
# Only new images are analysed.
status, place = call(f'{API}/{place["id"]}'); status, place = call(f'{API}/{place["id"]}/approve', {'rights_confirmed': True})
assert place['status'] == 'approved', place
status, result = analyze(place); assert status == 409 and 'nuove' in result['error'], result
# Merge: images move to the remaining tag and the merged label becomes its alias, also for later edits.
assert call(f'{API}/tags/merge', {'from': 'police-car', 'into': 'riot'}) == (200, {'merged': 'police-car', 'into': 'riot'})
vocabulary = labels(); assert 'police-car' not in vocabulary and 'police-car' in vocabulary['riot']['aliases'], vocabulary
status, place = call(f'{API}/{place["id"]}'); assert 'police-car' not in place['tags'] and 'riot' in place['tags'], place
status, result = call(f'{API}/bulk', {'action': 'tag-add', 'ids': [place['id']], 'tags': ['police-car', 'barricades']}); assert result['done'] == 1
assert 'police-car' not in labels()
# A tag disappears with its last image, its aliases with it; the spend register stays.
call(f'{API}/{place["id"]}/trash', {})
assert call(f'{API}/{place["id"]}', method='DELETE')[1]['deleted'] == 1
call(f'{API}/{other["id"]}/trash', {})
assert call(f'{API}/{other["id"]}', method='DELETE')[1]['deleted'] == 1
vocabulary = labels()
assert not {'barricade', 'place-de-la-republique', 'crowd', 'custom'} & set(vocabulary) and 'riot' in vocabulary, vocabulary
assert sql("SELECT count(*) AS n FROM tag_aliases WHERE alias='barricades'")[0]['n'] == 0
assert len(spend()) == 6
assert call(f'{API}/tags/alias', {'alias': 'police-car'}, method='DELETE') == (200, {'removed': 'police-car'})
assert labels()['riot']['aliases'] == []
# Model context: four parts with the approved first versions; each save is a version; restore; used by each call.
status, contexts = call(f'{API}/contexts'); assert status == 200 and contexts['max'] == 4000, contexts
parts = {p['part']: p for p in contexts['parts']}
assert set(parts) == {'base', 'analysis', 'slop_gallery_prompt', 'slop_evaluation'} and all(len(p['history']) == 1 for p in parts.values()), contexts
assert 'credibilità fotografica' in parts['slop_evaluation']['current']['body'], parts
first_analysis = parts['analysis']['current']
for wrong in ({'part': 'other', 'body': 'x'}, {'part': 'base', 'body': '   '}, {'part': 'base', 'body': 'x' * 4001}, {'part': 'base'}, {'part': 'base', 'body': 'x', 'extra': 1}):
    assert call(f'{API}/contexts', wrong)[0] == 400, wrong
assert call(f'{API}/contexts/restore', {'id': 'missing'})[0] == 404
custom = first_analysis['body'] + '\nContesto di prova 42.'
status, contexts = call(f'{API}/contexts', {'part': 'analysis', 'body': custom + '\r\n'}); assert status == 200
analysis_part = next(p for p in contexts['parts'] if p['part'] == 'analysis')
assert analysis_part['current']['body'] == custom and len(analysis_part['history']) == 2, analysis_part
assert len(next(p for p in call(f'{API}/contexts', {'part': 'analysis', 'body': custom})[1]['parts'] if p['part'] == 'analysis')['history']) == 2  # unchanged text: no new version
item, item_copy = image(80, 'Contesto')
status, item = call(f'{API}/{item["id"]}/copy', raw=item_copy, mime='image/webp'); assert status == 201, item
openai([{'tags': ['square'], 'caption': 'Una piazza.'}])
status, item = analyze(item); assert status == 200, item
[sent] = openai(); assert 'Contesto di prova 42.' in sent['body']['instructions'], sent['body']['instructions'][-300:]
assert item['analysis']['context'] == {'base': parts['base']['current']['id'], 'task': analysis_part['current']['id']}, item['analysis']
status, contexts = call(f'{API}/contexts/restore', {'id': first_analysis['id']}); assert status == 200
analysis_part = next(p for p in contexts['parts'] if p['part'] == 'analysis')
assert analysis_part['current']['body'] == first_analysis['body'] and len(analysis_part['history']) == 3, analysis_part
assert analysis_part['history'][1]['used'] == 1, analysis_part['history']  # the custom version, used by one image
call(f'{API}/{item["id"]}/trash', {}); assert call(f'{API}/{item["id"]}', method='DELETE')[1]['deleted'] == 1
# Tag categories. A plain list from the model (older answers) counts as «other».
assert all(t['category'] == 'other' for t in labels().values() if t['label'] in ('riot', 'crowd', 'street')), labels()
def categorized(**tags): return {c: tags.get(c, []) for c in ('time', 'genre', 'color', 'medium', 'place', 'setting', 'event', 'people', 'object', 'other')}
x, x_copy = image(110, 'Categorie X', 'Parigi, 1968.')
status, x = call(f'{API}/{x["id"]}/copy', raw=x_copy, mime='image/webp'); assert status == 201, x
openai([{'tags': categorized(time=['1960s', '1970s'], color=['Black and White'], place=['Paris'], event=['riot'], people=['Students'],
                             object=['1950s', 'Lamp Post'], setting=['night']), 'caption': 'Parigi, 1968. Studenti in strada.'}])
status, x = analyze(x); assert status == 200, x
[sent] = openai(); assert 'Existing vocabulary by category:\nother: ' in sent['body']['input'][0]['content'][0]['text'], sent['body']['input'][0]['content'][0]['text'][:300]
assert x['categories'] == {'1960s': 'time', 'black-and-white': 'color', 'paris': 'place', 'night': 'setting', 'riot': 'other',
                           'students': 'people', 'lamp-post': 'object'}, x['categories']  # 1970s and 1950s: a second Time tag, dropped
assert x['tag_conflicts'] == [{'label': 'riot', 'proposed': 'event', 'existing': 'other'}], x['tag_conflicts']
# Owner edits: a new tag takes the category asked; an existing one keeps its own; decades only in Time; one Time per image.
status, x = call(f'{API}/{x["id"]}'); x = patch(x, {'tags': x['tags'] + ['tram', 'riot'], 'tag_categories': {'tram': 'object', 'riot': 'place'}})
assert x['categories']['tram'] == 'object' and x['categories']['riot'] == 'other', x['categories']
for change, error in (({'tags': x['tags'] + ['1980s']}, 'Al massimo un tag di Tempo'), ({'tags': x['tags'] + ['sixties'], 'tag_categories': {'sixties': 'time'}}, 'decenni'),
                      ({'tags': ['1990s'], 'tag_categories': {'1990s': 'event'}}, 'Tempo'), ({'tags': ['sepia', 'color']}, 'Al massimo un tag di Colore'), ({'tags': ['kodachrome'], 'tag_categories': {'kodachrome': 'medium'}}, 'Supporto accetta solo'),
                      ({'tags': ['tram'], 'tag_categories': {'tram': 'format'}}, 'Categoria'),
                      ({'tags': ['tram'], 'tag_categories': {'tram': 'mood'}}, 'Categoria'), ({'tags': ['tram'], 'tag_categories': ['tram']}, 'Categorie')):
    status, result = call(f'{API}/{x["id"]}', {'revision': x['revision'], **change}, method='PATCH'); assert status == 400 and error in result['error'], (change, result)
# Change of category, for every image that uses the tag.
assert call(f'{API}/tags/category', {'label': 'riot', 'category': 'event'}, method='PUT') == (200, {'label': 'riot', 'category': 'event'})
assert labels()['riot']['category'] == 'event'
assert call(f'{API}/tags/category', {'label': 'paris', 'category': 'time'}, method='PUT')[0] == 400
assert call(f'{API}/tags/category', {'label': 'missing-tag', 'category': 'event'}, method='PUT')[0] == 404
y, y_copy = image(130, 'Categorie Y')
status, y = call(f'{API}/{y["id"]}/copy', raw=y_copy, mime='image/webp'); assert status == 201, y
y = patch(y, {'tags': ['sepia', '1970s', 'retro']})
assert y['categories'] == {'sepia': 'color', '1970s': 'time', 'retro': 'other'}, y['categories']  # a Color of the closed list is Color by itself
x = patch(x, {'tags': x['tags'] + ['retro', 'press-photo'], 'tag_categories': {'press-photo': 'genre'}})
status, result = call(f'{API}/tags/category', {'label': 'retro', 'category': 'time'}, method='PUT'); assert status == 400, result  # not a decade
status, result = call(f'{API}/tags/category', {'label': 'retro', 'category': 'genre'}, method='PUT'); assert status == 409 and '1 immagine' in result['error'], result
# Merge: the remaining tag keeps its category; refused when an image would end up with two Time tags.
status, result = call(f'{API}/tags/merge', {'from': 'retro', 'into': '1960s'}); assert status == 409 and 'due tag' in result['error'], result
assert call(f'{API}/tags/merge', {'from': 'sepia', 'into': 'black-and-white'})[0] == 200
status, y = call(f'{API}/{y["id"]}'); assert y['categories'].get('black-and-white') == 'color' and 'sepia' not in y['tags'], y
# Completion of Genre, Color and Medium for an image analysed before they existed: one paid call, once; only those three change.
assert x['completable'] is False and 'group' not in x and x['missing_categories'] == ['medium'], x  # analysed after 0048: no completion
sql(f"UPDATE images SET categories_completed_at=NULL WHERE id='{y['id']}'")
code, result = call(f'{API}/{y["id"]}/categories', {'confirm': True}); assert code == 409 and 'analisi' in result['error'], result  # never analysed
sql(f"UPDATE images SET analysis_status='done' WHERE id='{y['id']}'")
status, y = call(f'{API}/{y["id"]}'); assert y['completable'] and y['missing_categories'] == ['genre', 'medium'], y
for wrong in ({}, {'confirm': False}, {'confirm': True, 'model': 'x'}):
    assert call(f'{API}/{y["id"]}/categories', wrong)[0] == 400, wrong
openai([{'status': 400}])
assert call(f'{API}/{y["id"]}/categories', {'confirm': True})[0] == 502
status, y = call(f'{API}/{y["id"]}'); assert y['completable'], y  # a refusal is not charged: the image may try again
before = len(spend())
openai([{'json': {'tags': {'genre': ['Studio Portrait'], 'color': ['color'], 'medium': ['photo-print']}}}])
code, y = call(f'{API}/{y["id"]}/categories', {'confirm': True}); assert code == 200, y
# The three categories are replaced (black-and-white becomes color), the others stay.
assert y['categories'] == {'1970s': 'time', 'retro': 'other', 'studio-portrait': 'genre', 'color': 'color', 'photo-print': 'medium'}, y['categories']
assert 'group' not in y and not y['completable'], y
[sent] = openai(); assert sent['body']['text']['format']['schema']['properties']['tags']['required'] == ['genre', 'color', 'medium'], sent['body']['text']
assert 'mai dal titolo' in sent['body']['instructions'] and len(spend()) == before + 1 and spend()[-1]['kind'] == 'analysis'
openai([])
code, result = call(f'{API}/{y["id"]}/categories', {'confirm': True}); assert code == 409 and openai() == [], result  # once per image
# Bulk: a new tag with its category.
status, result = call(f'{API}/bulk', {'action': 'tag-add', 'ids': [x['id'], y['id']], 'tags': ['Bicycle'], 'category': 'object'}); assert result['done'] == 0 and result['failed'], result
status, result = call(f'{API}/bulk', {'action': 'tag-add', 'ids': [x['id'], y['id']], 'tags': ['bicycle'], 'category': 'object'}); assert result['done'] == 2, result
assert labels()['bicycle']['category'] == 'object'
for item in (x, y):
    call(f'{API}/{item["id"]}/trash', {}); assert call(f'{API}/{item["id"]}', method='DELETE')[1]['deleted'] == 1
assert 'bicycle' not in labels() and 'black-and-white' not in labels()
# Model selectors in Settings: lists from the code, availability from the OpenAI project; the analysis uses the text model.
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
z, z_copy = image(150, 'Modello scelto')
code, z = call(f'{API}/{z["id"]}/copy', raw=z_copy, mime='image/webp'); assert code == 201, z
openai([])
assert analyze(z)[0] == 200
[sent] = openai(); assert sent['body']['model'] == 'gpt-5-mini', sent['body']['model']
assert spend()[-1]['model'] == 'gpt-5-mini' and analysis_state()["model"] == 'gpt-5-mini'
call(f'{API}/{z["id"]}/trash', {}); call(f'{API}/{z["id"]}', method='DELETE')
assert call(f'{API}/models', {'text_model': 'gpt-6.1-sol', 'image_model': 'gpt-image-2.5-flare'}, method='PUT')[0] == 200
# A valid tags JSON with a missing private description must not partially replace the REAL's tags.
legacy, legacy_copy = image(175, 'Historical combined analysis', 'Original Commons source text.')
_, legacy = call(f'{API}/{legacy["id"]}/copy', raw=legacy_copy, mime='image/webp')
legacy = patch(legacy, {'tags':['preserved-tag']})
openai([{'json':{'tags':['new-tag']}, 'invalid_description':True}])
code, failed = analyze(legacy); assert code == 502 and 'Descrizione' in failed['error'], failed
_, legacy = call(f'{API}/{legacy["id"]}')
assert legacy['tags']==['preserved-tag'] and legacy['real_description'] is None and legacy['generated'] is None
assert spend()[-1]['status']=='completed'  # invalid output was still a paid completed call
# Legacy REAL: a separately confirmed combined analysis is allowed after approval, without an implicit backfill.
_, legacy = call(f'{API}/{legacy["id"]}/approve', {'rights_confirmed':True})
openai([])
code, legacy = call(f'{API}/{legacy["id"]}/analyze', {'confirm':True,'refresh_description':True})
assert code == 200 and legacy['status']=='approved' and legacy['real_description']['visible'], legacy
assert len(openai())==1 and legacy['description']=='Original Commons source text.'
_, legacy = call(f'{API}/{legacy["id"]}/publish', {})
legacy = patch(legacy, {'real_description':{**legacy['real_description'],'visible':'Privately corrected while published.'}})
assert legacy['status']=='published' and legacy['tags']==['crowd','street']
call(f'{API}/{legacy["id"]}/trash', {});call(f'{API}/{legacy["id"]}',method='DELETE')
print('Analysis integration passed: atomic REAL tags+description, independent private edits, confirmed legacy recovery, no partial output, model contexts, aliases, categories and paid-call outcomes.')
