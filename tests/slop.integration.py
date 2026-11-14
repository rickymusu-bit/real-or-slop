"""SLOP studio through the API with the fake OpenAI: spread, thresholds, slots, groups, prompts with formats (all and
one), edits, images from the prompt only, refusals and uncertain outcomes, analysis of a generated SLOP."""
import io
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
state = os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
API = base + '/api/admin/library/slop/'
LIBRARY = base + '/api/admin/library'
fake = os.environ['ROS_TEST_FAKE_OPENAI']

def call(path, data=None, method=None, raw=None, mime='application/json', url=None):
    body = raw if raw is not None else json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request((url or API) + path, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': mime, 'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def openai(queue=None):
    req = urllib.request.Request(fake + '/control', data=json.dumps({'queue': queue}).encode() if queue is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read()).get('log')
def calls(): return sql('SELECT kind,model,status FROM paid_calls ORDER BY created_at,rowid')
def sql_rows(command):
    out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command, '--json'],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[-1]['results']
def sql(command):
    out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command, '--json'],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[-1]['results']

code, state_now = call('state'); assert code == 200 and state_now['thresholds'] == {'section': 50, 'max_batch': 10}, state_now
if state_now['real_total'] < 50:
    code, result = call('batches', {'sources': ['x']}); assert code == 409 and 'almeno 50' in result['error'], result

# 60 REAL approved, with tags in their categories: 6 printed pages of a riot in the 1910s (measured), 6 slides of the 1920s (one
# measured), 4 portraits, the others with a filler tag. One SLOP is already the approved twin of slopt-1, one new twin of slopt-2.
statements, tags = [], {'st-riot': 'event', '1910s': 'time', '1920s': 'time', 'st-press': 'genre', 'st-portrait': 'genre', 'st-carnival': 'event',
                        'st-newsprint': 'medium', 'st-slide': 'medium', 'st-bw': 'color', 'st-colour': 'color', 'st-paris': 'place', 'st-milano': 'place',
                        'st-tram': 'object', 'st-cart': 'object', 'st-bus': 'object', 'st-radio': 'object', 'st-filler': 'other'}
statements.append('INSERT OR IGNORE INTO tags(id,label,category,created_at) VALUES ' + ','.join(f"('st-tag-{l}','{l}','{c}','x')" for l, c in tags.items()))
METRICS = json.dumps({'long': 700, 'noise': 4, 'sharpness': 10.2, 'contrast': 120, 'saturation': 0, 'cast': [0, 0, 0], 'v': 2})
def add(i, origin, labels, description='', status='approved', source=None, measured=False):
    h = format(i, '064x')
    statements.append(f"INSERT INTO images(id,origin,status,title,description,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,created_at,updated_at,generation_source,copy_metrics) "
                      f"VALUES('slopt-{i}','{origin}','{status}','t{i}','{description}','slopt/{i}','{h}','image/jpeg',10,10,'slopt/c{i}','{h}','{i:04d}','x',{repr(source) if source else 'NULL'},{repr(METRICS) if measured else 'NULL'})")
    if labels: statements.append('INSERT INTO image_tags(image_id,tag_id) VALUES ' + ','.join(f"('slopt-{i}','st-tag-{l}')" for l in labels))
for i in range(60):
    if i < 6: add(i, 'REAL', ['st-riot', 'st-press', '1910s', 'st-newsprint', 'st-bw', ['st-paris', 'st-milano'][i % 2], ['st-tram', 'st-cart'][i % 2]], f'Disordini in strada numero {i}', measured=True)
    elif i < 12: add(i, 'REAL', ['st-riot', 'st-press', '1920s', 'st-slide', 'st-colour', ['st-paris', 'st-milano'][i % 2], ['st-bus', 'st-radio'][i % 2]], measured=i == 6)
    elif i < 16: add(i, 'REAL', ['st-carnival', 'st-portrait', '1910s'])
    else: add(i, 'REAL', ['st-filler'])
add(1000, 'SLOP', ['st-riot', 'st-press', '1910s'], source='slopt-1'); add(1001, 'SLOP', [], status='new', source='slopt-2')
add(1002, 'SLOP', ['st-riot'], source='slopt-3')
statements.append("UPDATE images SET status='trash',trashed_from='approved',trashed_at='x' WHERE id='slopt-1002'")  # a twin in the trash frees its REAL
sql('; '.join(statements))
try:
    code, state_now = call('state'); assert code == 200 and state_now['real_total'] >= 60 and state_now['twinned'] == 1, state_now
    waiting = [w['id'] for w in state_now['waiting'] if w['id'].startswith('slopt-')]
    assert len(waiting) == 58 and 'slopt-1' not in waiting and 'slopt-2' not in waiting and waiting[0] == 'slopt-0' and 'slopt-3' in waiting, waiting[:5]
    first_waiting = state_now['waiting'][[w['id'] for w in state_now['waiting']].index('slopt-0')]
    assert first_waiting['measured'] and {'label': 'st-press', 'category': 'genre'} in first_waiting['tags'], first_waiting
    for wrong in ({}, {'sources': []}, {'sources': ['slopt-%d' % i for i in range(20, 31)]}, {'sources': ['bad id']}, {'sources': ['slopt-0'], 'theme': ['x']}):
        assert call('batches', wrong)[0] == 400, wrong
    code, result = call('batches', {'sources': ['slopt-1']}); assert code == 409 and 'ha già una SLOP gemella' in result['error'], result
    code, result = call('batches', {'sources': ['slopt-1000']}); assert code == 409 and 'non è più approvata' in result['error'], result
    # --- A batch of three REAL: each item keeps the tags of its REAL and a «REAL campione» of the same colour, medium and decade. ---
    code, batch = call('batches', {'sources': ['slopt-0', 'slopt-7', 'slopt-12']}); assert code == 200 and batch['prompts'] == [] and batch['images'] == [], batch
    bid, items = batch['id'], batch['items']
    assert [i['source'] for i in items] == ['slopt-0', 'slopt-7', 'slopt-12'] and items[0]['title'] == 't0', items
    assert items[0]['sample'] in {f'slopt-{i}' for i in range(1, 6)}, items[0]  # another printed page of the 1910s
    assert items[1]['sample'] == 'slopt-6', items[1]  # the only measured slide of the 1920s
    assert items[2]['sample'] is None, items[2]  # no measured portrait: no treatment
    assert {'label': 'st-tram', 'category': 'object'} in items[0]['tags'] and {'label': '1910s', 'category': 'time'} in items[0]['tags'], items[0]
    before = len(calls())
    openai([])
    for wrong in ({}, {'confirm': False}, {'confirm': True, 'index': 9}, {'confirm': True, 'other': 1}):
        assert call(f'batches/{bid}/prompts', wrong)[0] == 400, wrong
    assert openai() == [] and len(calls()) == before  # nothing sent, nothing recorded
    code, batch = call(f'batches/{bid}/prompts', {'confirm': True}); assert code == 200 and batch['prompts_status'] == 'done', batch
    assert len(batch['prompts']) == 3 and batch['prompts'][0]['prompt'].startswith('A documentary photograph: 1910s, st-press, st-bw, st-newsprint, st-paris, st-riot'), batch['prompts']
    [sent] = openai()
    body = sent['body']; assert body['model'] == 'gpt-6.1-terra' and body['text']['format']['name'] == 'slop_prompts', body['model']
    assert body['instructions'].startswith('Lavori per un archivio') and 'Scrivi prompt per un generatore' in body['instructions']
    assert 'Write every prompt in English, between 600 and 1000 characters' in body['instructions'] and 'Write the prompt of ANOTHER photograph' in body['instructions']
    assert body['max_output_tokens'] == 16000, body['max_output_tokens']
    request = json.loads(body['input'][0]['content'][0]['text'])
    assert request['count'] == 3 and len(request['items']) == 3 and 'sample' not in json.dumps(request) and 'slopt-' not in json.dumps(request), request
    first_item = request['items'][0]
    assert first_item['description'] == 'Disordini in strada numero 0' and first_item['tags']['object'] == ['st-tram'] and first_item['tags']['time'] == ['1910s'], first_item
    # Related: other REAL of the same decade sharing the event or the place, never the source itself, never another decade.
    assert 1 <= len(first_item['related']) <= 3 and all(r.startswith('Disordini in strada numero') and not r.endswith(' 0') for r in first_item['related']), first_item
    assert request['items'][2]['related'] == [], request['items'][2]
    assert calls()[-1] == {'kind': 'prompts', 'model': 'gpt-6.1-terra', 'status': 'completed'}
    # The owner edits a prompt (free); one prompt is rewritten (paid) and the others stay.
    edited = [p['prompt'] for p in batch['prompts']]; edited[2] = 'Edited by the owner: a portrait at the carnival'
    code, batch = call(f'batches/{bid}', {'prompts': edited}, method='PUT'); assert code == 200 and batch['prompts'][2]['prompt'].startswith('Edited'), batch
    assert call(f'batches/{bid}', {'prompts': edited[:2]}, method='PUT')[0] == 400 and call(f'batches/{bid}', {'slots': []}, method='PUT')[0] == 400
    assert [p['format'] for p in batch['prompts']] == ['3:2', '2:3', '4:3'], batch['prompts']
    assert body['text']['format']['schema']['properties']['prompts']['items']['properties']['format']['enum'] == ['3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '1:1']
    # The owner changes a format (free); a format outside the set is refused.
    assert call(f'batches/{bid}', {'formats': ['3:2', '4:5', '4:3']}, method='PUT')[0] == 400
    code, batch = call(f'batches/{bid}', {'formats': ['3:2', '9:16', '4:3']}, method='PUT'); assert [p['format'] for p in batch['prompts']] == ['3:2', '9:16', '4:3'], batch
    # A rewritten prompt without its format is unreadable: refused, prompts kept.
    openai([{'json': {'prompts': [{'prompt': 'Rewritten: st-riot at dusk', 'used_tags': []}]}}])
    code, result_error = call(f'batches/{bid}/prompts', {'confirm': True, 'index': 1}); assert code == 502, result_error
    openai()
    openai([{'json': {'prompts': [{'prompt': 'Rewritten: st-riot at dusk', 'used_tags': [], 'format': '2:3'}]}}])
    code, batch = call(f'batches/{bid}/prompts', {'confirm': True, 'index': 1}); assert code == 200, batch
    assert [p['prompt'][:9] for p in batch['prompts']] == ['A documen', 'Rewritten', 'Edited by'], batch['prompts']
    [sent] = openai(); assert json.loads(sent['body']['input'][0]['content'][0]['text'])['count'] == 1
    # Uncertain: recorded, prompts kept, never resent.
    openai([{'status': 500}])
    code, result_error = call(f'batches/{bid}/prompts', {'confirm': True}); assert code == 502 and 'incerto' in result_error['error'], result_error
    assert len(openai()) == 1 and calls()[-1]['status'] == 'uncertain'
    code, batch = call(f'batches/{bid}'); assert batch['prompts_status'] == 'uncertain' and batch['prompts'][1]['prompt'].startswith('Rewritten'), batch
    # Images: the chosen image model, a quality it accepts, only the prompt text sent; formats in turn.
    for wrong in ({'confirm': True, 'index': 0}, {'confirm': True, 'index': 0, 'quality': 'ultra'}, {'confirm': True, 'index': 5, 'quality': 'medium'}, {'index': 0, 'quality': 'medium'}):
        assert call(f'batches/{bid}/images', wrong)[0] == 400, wrong
    openai([])
    code, first = call(f'batches/{bid}/images', {'confirm': True, 'index': 0, 'quality': 'medium'}); assert code == 200, first
    assert first['origin'] == 'SLOP' and first['status'] == 'new' and first['model'] == 'gpt-image-2.5-flare' and first['prompt'] == batch['prompts'][0]['prompt'], first
    assert first['title'] == 'Gemella di t0' and first['generation'] == {'batch': bid, 'source': 'slopt-0', 'quality': 'medium',
        'slot': {'index': 0, 'source': 'slopt-0', 'sample': items[0]['sample'], 'tags': items[0]['tags']}}, first['generation']
    code, state_now = call('state'); assert 'slopt-0' not in [w['id'] for w in state_now['waiting']]  # a new twin takes its REAL out of the queue
    assert (first['width'], first['height']) == (96, 64)  # 3:2: 1536×1024 from the fake generator, scaled by 1/16
    code, second = call(f'batches/{bid}/images', {'confirm': True, 'index': 1, 'quality': 'max'}); assert code == 200 and (second['width'], second['height']) == (64, 96), second
    sent = openai(); assert [s['path'] for s in sent] == ['/v1/images/generations'] * 2
    assert sent[0]['body'] == {'model': 'gpt-image-2.5-flare', 'prompt': batch['prompts'][0]['prompt'], 'n': 1, 'size': '1536x1024', 'quality': 'medium'}, sent[0]['body']
    assert sent[1]['body']['size'] == '1024x1536'  # the format of the rewritten prompt, 2:3
    assert [c['kind'] for c in calls()[-2:]] == ['images', 'images'] and calls()[-1]['status'] == 'completed'
    # Refused by the generator's rules: failed, no image; server error: uncertain.
    openai([{'status': 400, 'code': 'moderation_blocked'}])
    code, refused = call(f'batches/{bid}/images', {'confirm': True, 'index': 2, 'quality': 'low'}); assert code == 502 and "regole d'uso" in refused['error'], refused
    assert calls()[-1]['status'] == 'failed'
    openai([{'status': 503}])
    assert call(f'batches/{bid}/images', {'confirm': True, 'index': 2, 'quality': 'low'})[0] == 502 and calls()[-1]['status'] == 'uncertain'
    code, batch = call(f'batches/{bid}'); assert [i['id'] for i in batch['images']] == [first['id'], second['id']], batch['images']
    code, listing = call('batches'); assert any(b['id'] == bid and b['images'] == 2 and b['count'] == 3 for b in listing['batches']), listing
    # The analysis of a generated SLOP is the REAL one: game copy, then tags and caption with the prompt as context.
    from PIL import Image
    from game_copy import game_copy
    code, original = 200, urllib.request.urlopen(urllib.request.Request(LIBRARY + f'/{first["id"]}/original', headers={'Authorization': 'Bearer ' + token})).read()
    copy = game_copy(original)
    # Measures and treatment travel with the copy in headers; the server checks them (spec `copie-di-gioco`, section 4).
    metrics = {'long': 96, 'noise': 1.5, 'sharpness': 10.2, 'contrast': 120, 'saturation': 0.2, 'cast': [1, 0, -1]}
    sample = {'id': items[0]['sample'], 'metrics': {**metrics, 'long': 700, 'noise': 4}}
    treatment = {'version': 2, 'off': False, 'seed': 7, 'long': 96, 'medium': 'newspaper-print', 'color': 'black-and-white', 'sample': sample}
    def upload(headers):
        req = urllib.request.Request(LIBRARY + f'/{first["id"]}/copy', data=copy, method='POST',
                                     headers={'Content-Type': 'image/webp', 'Authorization': 'Bearer ' + token, **headers})
        try:
            with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
    assert upload({'X-Copy-Metrics': '{"long": 1}'})[0] == 400
    assert upload({'X-Copy-Treatment': json.dumps({**treatment, 'version': 9})})[0] == 400
    assert upload({'X-Copy-Treatment': json.dumps({**treatment, 'long': 50})})[0] == 400  # not the long side the sample gives
    code, first = upload({'X-Copy-Metrics': json.dumps(metrics), 'X-Copy-Treatment': json.dumps(treatment)}); assert code == 201, first
    assert first['metrics'] == metrics and first['treatment']['sample']['id'] == sample['id'] and first['treatment']['off'] is False, first
    code, again = upload({'X-Copy-Metrics': json.dumps(metrics), 'X-Copy-Treatment': json.dumps(treatment)}); assert again['already_prepared'], again
    code, off = upload({'X-Copy-Metrics': json.dumps(metrics), 'X-Copy-Treatment': json.dumps({**treatment, 'off': True})})
    assert code == 201 and not off['already_prepared'] and off['treatment']['off'] is True, off  # «Senza trattamento» makes the copy again
    first = off
    code, result_error = call(f'/{first["id"]}/metrics', {'metrics': metrics, 'sha256': 'x' * 64}, url=LIBRARY); assert code == 409, result_error
    code, measured = call(f'/{first["id"]}/metrics', {'metrics': {**metrics, 'noise': 2}, 'sha256': first['copy']['sha256']}, url=LIBRARY); assert code == 200, measured
    openai([])
    code, first = call(f'/{first["id"]}/analyze', {'confirm': True}, url=LIBRARY); assert code == 200 and first['tags'] == ['crowd', 'street'], first
    [sent] = openai(); assert 'Description: ' + first['prompt'] in sent['body']['input'][0]['content'][0]['text']
    assert not any(word in json.dumps(sent['body']) for word in ('SLOP', 'REAL', 'slop_prompts')), 'the analysis must not know the origin'
finally:
    for row in sql_rows("SELECT id FROM images WHERE generation_batch IS NOT NULL"):
        call(f'/{row["id"]}/trash', {}, url=LIBRARY); call(f'/{row["id"]}', method='DELETE', url=LIBRARY)
    sql("DELETE FROM images WHERE id LIKE 'slopt-%'; DELETE FROM slop_batches")
    sql("DELETE FROM tags WHERE id LIKE 'st-tag-%' AND id NOT IN (SELECT tag_id FROM image_tags)")
assert not [w for w in call('state')[1]['waiting'] if w['id'].startswith('slopt-')]
print('SLOP studio integration passed: REAL waiting for a twin, batches of REAL with a REAL campione each, prompts from the tags and the description of each REAL (all and one), edits, images from the prompt only, refusals and uncertain outcomes, copy with measures and treatment, analysis of a generated SLOP.')
