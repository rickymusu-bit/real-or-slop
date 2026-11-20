"""Paid analysis against a local Worker and the fake OpenAI (never the real one): confirmation of each call, register of
calls, model selectors, uncertain outcomes not resent, OpenAI limits, editorial description of a REAL only (no tags, no analysis of a
SLOP, owner decision of 2026-11-20), model context with versions, no captions."""
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
# Tags are gone: no vocabulary, aliases, categories or completion, and edits that carry them are refused.
for path, method, body in (('/tags', 'GET', None), ('/tags/alias', 'POST', {'alias': 'a', 'into': 'b'}), ('/tags/merge', 'POST', {'from': 'a', 'into': 'b'}),
                           ('/tags/category', 'PUT', {'label': 'a', 'category': 'other'}), (f'/{place["id"]}/categories', 'POST', {'confirm': True})):
    assert call(API + path, body, method=method)[0] == 404, path
for change in ({'tags': ['riot']}, {'tag_categories': {}}):
    status, result = call(f'{API}/{place["id"]}', {'revision': place['revision'], **change}, method='PATCH'); assert status == 400 and 'Campi non previsti' in result['error'], result
assert call(f'{API}?' + urllib.parse.urlencode({'gallery': gallery_id, 'tags': 'riot'}))[0] == 400
assert not {'tags', 'categories', 'generated', 'missing_categories', 'completable'} & set(place), place
# A successful analysis: the editorial description only, of the whole original; anything else in the answer is ignored.
openai([])
status, place = analyze(place); assert status == 200, place
assert 'caption' not in place and 'proposed_caption' not in place and 'tags' not in place and 'proposed_tags' not in place and place['analysis']['status'] == 'done', place
assert place['real_description']['visible'] and place['real_description_provenance']['model']=='gpt-6.1-sol'
assert place['real_description_provenance']['image']=='original' and place['real_description_provenance']['original_sha256']==place['original_sha256']
assert place['description']=='Manifestanti e polizia in place de la République.'
original_description=place['real_description']
place=patch(place, {'real_description': {**original_description,'visible':'Owner corrected visible content.'}})
assert place['real_description']['visible']=='Owner corrected visible content.' and place['real_description_provenance']['generated']==original_description
[sent] = openai()
assert sent['authorization'] == 'Bearer test-openai-key' and sent['body']['model'] == 'gpt-6.1-sol' and sent['body']['max_output_tokens'] == 8000, sent['authorization']
text, picture = sent['body']['input'][0]['content'][0]['text'], sent['body']['input'][0]['content'][1]['image_url']
assert 'Title: Place de la République, 1968' in text and 'vocabulary' not in text, text
assert picture.startswith('data:image/jpeg;base64,/9j/'), picture[:40]  # the uploaded original, not the 4:5 game copy
import base64 as _b64
assert Image.open(io.BytesIO(_b64.b64decode(picture.split(',', 1)[1]))).size == (48, 32)  # whole frame, no crop
assert not any(word in json.dumps(sent['body']) for word in ('REAL', 'SLOP', '"AI"')), 'the model must not know the origin'
# The instructions are the editable context (base, then analysis) plus the fixed line on the JSON output.
assert sent['body']['instructions'].startswith('Lavori per un archivio fotografico italiano') and 'Didascalia' not in sent['body']['instructions'], sent['body']['instructions'][:200]
assert 'real_description' in sent['body']['instructions'] and 'Tag:' not in sent['body']['instructions'] and 'tag ' not in sent['body']['instructions'].lower()
schema = sent['body']['text']['format']['schema']
assert schema['required'] == ['real_description'] and list(schema['properties']) == ['real_description'], schema
assert 'generat' not in sent['body']['instructions'], 'the base and the description rules must not mention generated images'
assert spend() == [{'kind': 'analysis', 'model': 'gpt-6.1-sol', 'status': 'completed', 'input_tokens': 1200, 'output_tokens': 60}], spend()
# Without the detail's explicit repeat, a second analysis is refused before anything is sent.
openai([])
status, result = analyze(place); assert status == 409 and 'già generata' in result['error'], result
assert openai() == [] and len(spend()) == 1
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
status, other = analyze(other, repeat=True); assert status == 200 and other['real_description']['visible'] and len(spend()) == 6, other
assert analyze(other, repeat=True)[0] == 409  # done: the flag does not open a second analysis
status, result = analyze(other); assert status == 409 and 'già generata' in result['error'] and len(spend()) == 6, result
# Only new images are analysed.
status, place = call(f'{API}/{place["id"]}'); status, place = call(f'{API}/{place["id"]}/approve', {'rights_confirmed': True})
assert place['status'] == 'approved', place
status, result = analyze(place); assert status == 409 and 'nuove' in result['error'], result
status, result = call(f'{API}/bulk', {'action': 'tag-add', 'ids': [place['id']], 'tags': ['riot']}); assert result['done'] == 0 and result['failed'], result
# A SLOP is never analysed: it has neither tags nor an editorial description.
picture = Image.new('RGB', (48, 32), (20, 140, 60)); source = io.BytesIO(); picture.save(source, 'PNG')
status, slop = call(f'{API}/upload?' + urllib.parse.urlencode({'gallery_id': gallery_id, 'origin': 'SLOP', 'prompt': 'A street.'}), raw=source.getvalue(), mime='image/png')
assert status == 201, slop
openai([])
status, result = analyze(slop); assert status == 409 and 'solo le REAL' in result['error'] and openai() == [] and len(spend()) == 6, result
call(f'{API}/{slop["id"]}/trash', {}); assert call(f'{API}/{slop["id"]}', method='DELETE')[1]['deleted'] == 1
# Deleting photos keeps the spend register.
call(f'{API}/{place["id"]}/trash', {})
assert call(f'{API}/{place["id"]}', method='DELETE')[1]['deleted'] == 1
call(f'{API}/{other["id"]}/trash', {})
assert call(f'{API}/{other["id"]}', method='DELETE')[1]['deleted'] == 1
assert len(spend()) == 6
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
openai([])
status, item = analyze(item); assert status == 200, item
[sent] = openai(); assert 'Contesto di prova 42.' in sent['body']['instructions'], sent['body']['instructions'][-300:]
assert item['analysis']['context'] == {'base': parts['base']['current']['id'], 'task': analysis_part['current']['id']}, item['analysis']
status, contexts = call(f'{API}/contexts/restore', {'id': first_analysis['id']}); assert status == 200
analysis_part = next(p for p in contexts['parts'] if p['part'] == 'analysis')
assert analysis_part['current']['body'] == first_analysis['body'] and len(analysis_part['history']) == 3, analysis_part
assert analysis_part['history'][1]['used'] == 1, analysis_part['history']  # the custom version, used by one image
call(f'{API}/{item["id"]}/trash', {}); assert call(f'{API}/{item["id"]}', method='DELETE')[1]['deleted'] == 1
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
# An answer without a valid description saves nothing.
legacy, legacy_copy = image(175, 'Historical combined analysis', 'Original Commons source text.')
_, legacy = call(f'{API}/{legacy["id"]}/copy', raw=legacy_copy, mime='image/webp')
openai([{'json': {'real_description': {'visible': ''}}}])
code, failed = analyze(legacy); assert code == 502 and 'Descrizione' in failed['error'], failed
_, legacy = call(f'{API}/{legacy["id"]}')
assert legacy['real_description'] is None and legacy['analysis']['status'] == 'failed', legacy
assert spend()[-1]['status']=='completed'  # invalid output was still a paid completed call
# Legacy REAL: a separately confirmed combined analysis is allowed after approval, without an implicit backfill.
_, legacy = call(f'{API}/{legacy["id"]}/approve', {'rights_confirmed':True})
openai([])
code, legacy = call(f'{API}/{legacy["id"]}/analyze', {'confirm':True,'refresh_description':True})
assert code == 200 and legacy['status']=='approved' and legacy['real_description']['visible'], legacy
assert len(openai())==1 and legacy['description']=='Original Commons source text.'
redo = f'{API}/{legacy["id"]}/analyze'
openai([])
assert call(redo, {'reanalyze': True})[0] == 400 and openai() == []
assert call(redo, {'confirm': True, 'reanalyze': False})[0] == 400 and openai() == []
openai([{'description': {'visible': 'A catalogue print.', 'documented_context': '', 'uncertainties': 'Date unknown.'}}])
code, legacy = call(redo, {'confirm': True, 'reanalyze': True})
assert code == 200 and legacy['status'] == 'approved' and legacy['real_description']['visible'] == 'A catalogue print.', legacy
assert len(openai()) == 1
_, legacy = call(f'{API}/{legacy["id"]}/publish', {})
openai([])
assert call(redo, {'confirm': True, 'reanalyze': True})[0] == 409 and openai() == []
legacy = patch(legacy, {'real_description':{**legacy['real_description'],'visible':'Privately corrected while published.'}})
assert legacy['status']=='published' and legacy['real_description']['visible']=='Privately corrected while published.'
call(f'{API}/{legacy["id"]}/trash', {});call(f'{API}/{legacy["id"]}',method='DELETE')
print('Analysis integration passed: REAL description only, no tags, no SLOP analysis, independent private edits, confirmed legacy recovery, no partial output, model contexts and paid-call outcomes.')
