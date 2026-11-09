"""v1.1.0, 2026-11-09T21:30:00Z: phase 2 of docs/libreria-immagini.v1.3.0.md against a LOCAL Worker and the fake
OpenAI of tests/fake_openai.py (never the real one): confirmation of the maximum cost, one budget (default 5 $, changed,
renewed), cost from the tokens, uncertain outcomes not resent, OpenAI's own spend limit, tags cleaned and resolved through
aliases, caption only when empty, merge, aliases, tags removed with their last image. Model gpt-6.1-terra at 1 $ and 5 $
per million tokens: at most 0.018 $ per call (8000 input and 2000 output tokens), 0.0015 $ for 1200 and 60 tokens."""
import io
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
state, fake = os.environ['ROS_TEST_STATE'], os.environ['ROS_TEST_FAKE_OPENAI']; assert fake.startswith('http://127.0.0.1:')
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
API = base + '/api/admin/library'

def call(url, data=None, method=None, raw=None, mime='application/json'):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': mime, 'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def sql(command):
    out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command, '--json'],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]['results']
def openai(queue=None):
    """Sets the fake model's next answers (and clears its log), or returns the requests it received."""
    req = urllib.request.Request(fake + '/control', data=json.dumps({'queue': queue}).encode() if queue is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read()).get('log')
def image(color, title, description=''):
    picture = Image.new('RGB', (48, 32)); picture.putdata([(color, (x * 7) % 256, (y * 11) % 256) for y in range(32) for x in range(48)])
    source, copy = io.BytesIO(), io.BytesIO(); picture.save(source, 'JPEG', quality=95); picture.save(copy, 'WEBP', quality=85)
    status, item = call(f'{API}/upload?' + urllib.parse.urlencode({'origin': 'REAL', 'title': title, 'description': description}),
                        raw=source.getvalue(), mime='image/jpeg'); assert status == 201, item
    return item, copy.getvalue()
def analyze(item, confirm=0.018):
    return call(f'{API}/{item["id"]}/analyze', {'confirm_usd': confirm} if confirm is not None else {})
def patch(item, change):
    status, result = call(f'{API}/{item["id"]}', {'revision': item['revision'], **change}, method='PATCH'); assert status == 200, result
    return result
def spend(): return sql('SELECT status,reserved_usd,cost_usd,input_tokens,output_tokens FROM spend ORDER BY created_at,rowid')
def budget(): return call(f'{API}/analysis')[1]
def labels(): return {t['label']: t for t in call(f'{API}/tags')[1]['tags']}

info = budget()
assert info['enabled'] and info['model'] == 'gpt-6.1-terra' and info['call_usd'] == 0.018 and info['price'] == {'input': 1, 'output': 5}, info
assert info['cap_usd'] == 5 and info['spent_usd'] == 0 and info['remaining_usd'] == 5, info  # the default budget
# No call without the game copy, nor without the exact cost confirmation.
place, place_copy = image(170, 'Place de la République, 1968', 'Manifestanti e polizia in place de la République.')
openai([])
status, result = analyze(place); assert status == 409 and 'copia' in result['error'], result
status, place = call(f'{API}/{place["id"]}/copy', raw=place_copy, mime='image/webp'); assert status == 201, place
for confirm in (None, 0.01, '0.018'):
    status, result = analyze(place, confirm); assert status == 400 and '0.018' in result['error'], result
assert call(f'{API}/{place["id"]}/analyze', {'confirm_usd': 0.018, 'model': 'other'})[0] == 400
assert openai() == [] and spend() == []
# Aliases: an alias resolves to its tag; a tag cannot become an alias this way.
place = patch(place, {'tags': ['barricade']})
assert call(f'{API}/tags/alias', {'alias': 'barricades', 'into': 'barricade'}) == (201, {'alias': 'barricades', 'into': 'barricade'})
assert call(f'{API}/tags/alias', {'alias': 'riot', 'into': 'barricade'})[0] == 409
assert call(f'{API}/tags/alias', {'alias': 'barricades', 'into': 'barricade'})[0] == 409
# A successful analysis: tags made ASCII, origin words dropped, aliases resolved, owner's tags kept, caption filled.
openai([{'tags': ['Riot', 'Police Car', 'Place de la République', 'ai', 'photo-real', 'barricades', 'riot'],
         'caption': '  Parigi, maggio 1968.\nScontri in place de la Republique.  '}])
status, place = analyze(place); assert status == 200, place
assert place['tags'] == ['barricade', 'place-de-la-republique', 'police-car', 'riot'], place
assert sorted(place['proposed_tags']) == ['barricade', 'place-de-la-republique', 'police-car', 'riot'], place
assert place['caption'] == 'Parigi, maggio 1968. Scontri in place de la Republique.' and place['analysis']['status'] == 'done', place
[sent] = openai()
assert sent['authorization'] == 'Bearer test-openai-key' and sent['body']['model'] == 'gpt-6.1-terra' and sent['body']['max_output_tokens'] == 2000, sent['authorization']
text, picture = sent['body']['input'][0]['content'][0]['text'], sent['body']['input'][0]['content'][1]['image_url']
assert 'barricade' in text and 'riot' in text and 'Title: Place de la République, 1968' in text, text
assert picture.startswith('data:image/webp;base64,UklGR'), picture[:40]  # the game copy, as the player will see it
assert not any(word in json.dumps(sent['body']) for word in ('REAL', 'SLOP', '"AI"')), 'the model must not know the origin'
assert spend() == [{'status': 'completed', 'reserved_usd': 0.018, 'cost_usd': 0.0015, 'input_tokens': 1200, 'output_tokens': 60}], spend()
# Again: the caption already there is never replaced; tags are only added.
openai([{'tags': ['crowd'], 'caption': 'Altro testo.'}])
status, place = analyze(place); assert status == 200 and place['caption'].startswith('Parigi') and 'crowd' in place['tags'], place
# The owner changes the one budget; invalid caps are refused.
for cap in (0, -1, 'x', 5000, None): assert call(f'{API}/budget', {'cap_usd': cap} if cap is not None else {}, method='PUT')[0] == 400
status, info = call(f'{API}/budget', {'cap_usd': 0.04}, method='PUT')
assert status == 200 and info['cap_usd'] == 0.04 and info['spent_usd'] == 0.003 and info['remaining_usd'] == 0.037, info
# Server error or no answer: uncertain, the maximum stays counted, never resent. Client error: failed, not counted.
openai([{'status': 500}])
status, result = analyze(place); assert status == 502, result
assert len(openai()) == 1
status, place = call(f'{API}/{place["id"]}'); assert place['analysis']['status'] == 'uncertain' and 'addebitata' in place['analysis']['error'], place
openai([{'status': 400}])
assert analyze(place)[0] == 502
status, place = call(f'{API}/{place["id"]}'); assert place['analysis']['status'] == 'failed', place
# OpenAI's own spend limit or credit reached first: refused there, nothing charged, a message the dashboard stops on.
openai([{'status': 429, 'code': 'insufficient_quota'}])
status, result = analyze(place); assert status == 502 and result['error'].startswith('OpenAI: limite di spesa'), result
# An answer that cannot be read was paid all the same, at the cost of its tokens.
openai([{'garbage': True}])
assert analyze(place)[0] == 502
assert [(row['status'], row['cost_usd']) for row in spend()] == [('completed', 0.0015), ('completed', 0.0015), ('uncertain', None),
                                                                  ('failed', 0), ('failed', 0), ('completed', 0.0015)], spend()
info = budget(); assert info['spent_usd'] == 0.0225 and info['remaining_usd'] == 0.0175, info
# Less than the maximum of one call left: refused before anything is sent.
openai([])
status, result = analyze(place); assert status == 409 and 'Tetto' in result['error'], result
assert openai() == [] and len(spend()) == 6
# One call at a time per image; a «running» mark left by a Worker that died stops blocking after ten minutes.
sql(f"UPDATE images SET analysis_status='running' WHERE id='{place['id']}'")
status, result = analyze(place); assert status == 409 and 'in corso' in result['error'], result
sql(f"UPDATE images SET updated_at='2000-01-01T00:00:00.000Z' WHERE id='{place['id']}'")
status, result = analyze(place); assert status == 409 and 'Tetto' in result['error'], result
sql(f"UPDATE images SET analysis_status='done' WHERE id='{place['id']}'")
# Renewing starts a new period from zero; the register keeps every call.
status, info = call(f'{API}/budget/renew', {}); assert status == 200 and info['spent_usd'] == 0 and info['cap_usd'] == 0.04, info
assert analyze(place)[0] == 200 and len(spend()) == 7
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
vocabulary = labels()
assert not {'barricade', 'place-de-la-republique', 'crowd'} & set(vocabulary) and 'riot' in vocabulary, vocabulary
assert sql("SELECT count(*) AS n FROM tag_aliases WHERE alias='barricades'")[0]['n'] == 0
assert len(spend()) == 7
assert call(f'{API}/tags/alias', {'alias': 'police-car'}, method='DELETE') == (200, {'removed': 'police-car'})
assert labels()['riot']['aliases'] == []
assert call(f'{API}/budget/renew', {'cap_usd': 5})[1]['remaining_usd'] == 5  # a fresh budget for the browser checks
print('Analysis integration passed: cost confirmation, one budget changed and renewed, cost from tokens, uncertain not resent, OpenAI limit, ASCII tags, aliases, caption kept, merge, tags removed with their last image.')
