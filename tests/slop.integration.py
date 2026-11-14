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

code, spread = call('spread'); assert code == 200 and spread['thresholds'] == {'section': 50, 'group': 5, 'max_slots': 10}, spread
G1, G2, G3 = 'st-press/1910s', 'st-press/1920s', 'st-portrait/1910s'
if spread['real_total'] < 50:
    code, result = call('slots', {'group': G1, 'count': 1}); assert code == 409 and 'almeno 50' in result['error'], result

# 60 REAL and 2 SLOP, approved, with tags in their categories. Groups: st-press/1910s (6 REAL, printed pages, trams and carts),
# st-press/1920s (6 REAL, slides, buses and radios), st-portrait/1910s (4 REAL: below the threshold of 5); the others in no group.
statements, tags = [], {'st-riot': 'event', '1910s': 'time', '1920s': 'time', 'st-press': 'genre', 'st-portrait': 'genre', 'st-carnival': 'event',
                        'st-newsprint': 'medium', 'st-slide': 'medium', 'st-bw': 'color', 'st-colour': 'color', 'st-paris': 'place', 'st-milano': 'place',
                        'st-tram': 'object', 'st-cart': 'object', 'st-bus': 'object', 'st-radio': 'object', 'st-filler': 'other'}
statements.append('INSERT OR IGNORE INTO tags(id,label,category,created_at) VALUES ' + ','.join(f"('st-tag-{l}','{l}','{c}','x')" for l, c in tags.items()))
def add(i, origin, labels, description=''):
    h = format(i, '064x')
    statements.append(f"INSERT INTO images(id,origin,status,title,description,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,created_at,updated_at) "
                      f"VALUES('slopt-{i}','{origin}','approved','t{i}','{description}','slopt/{i}','{h}','image/jpeg',10,10,'slopt/c{i}','{h}','x','x')")
    statements.append('INSERT INTO image_tags(image_id,tag_id) VALUES ' + ','.join(f"('slopt-{i}','st-tag-{l}')" for l in labels))
for i in range(60):
    if i < 6: add(i, 'REAL', ['st-riot', 'st-press', '1910s', 'st-newsprint', 'st-bw', ['st-paris', 'st-milano'][i % 2], ['st-tram', 'st-cart'][i % 2]], f'Disordini in strada numero {i}')
    elif i < 12: add(i, 'REAL', ['st-riot', 'st-press', '1920s', 'st-slide', 'st-colour', ['st-paris', 'st-milano'][i % 2], ['st-bus', 'st-radio'][i % 2]])
    elif i < 16: add(i, 'REAL', ['st-carnival', 'st-portrait', '1910s'])
    else: add(i, 'REAL', ['st-filler'])
add(1000, 'SLOP', ['st-riot', 'st-press', '1910s']); add(1001, 'SLOP', ['st-riot'])
sql('; '.join(statements))
try:
    code, spread = call('spread'); assert code == 200 and spread['real_total'] >= 60 and spread['slop_total'] >= 2, spread
    rows = {t['label']: t for t in spread['tags']}
    assert rows['st-riot'] == {'label': 'st-riot', 'category': 'event', 'real': 12, 'slop': 2, 'spread': 10}, rows['st-riot']
    groups = {g['key']: g for g in spread['groups']}
    assert {k: (g['real'], g['slop'], g['fresh'], g['spread'], g['missing_real'], g['room']) for k, g in groups.items() if k.startswith('st-')} == {
        G1: (6, 1, 0, 5, 0, 5), G2: (6, 0, 0, 6, 0, 6), G3: (4, 0, 0, 4, 1, 4)}, groups
    assert call('reference', {'group': G1, 'theme': ['st-riot']})[1] == {'group': G1, 'theme': ['st-riot'], 'reference': 6, 'needed': 5, 'room': 5}
    assert call('reference', {'group': G2})[1]['reference'] == 6 and call('reference', {'group': G3})[1]['reference'] == 4
    assert call('reference', {'group': G1, 'theme': ['st-carnival']})[1]['reference'] == 0
    code, result = call('slots', {'group': G3, 'count': 2}); assert code == 409 and 'ne servono 5' in result['error'], result
    for wrong in ({'group': 'st-press', 'count': 1}, {'count': 1}, {'group': G1, 'count': 11}, {'group': G1, 'count': 0}, {'group': G1, 'theme': ['st-unknown'], 'count': 1},
                  {'group': G1, 'count': 1, 'extra': 1}, {'group': G1, 'count': 1, 'existing': 'x'}):
        assert call('slots', wrong)[0] == 400, wrong
    code, result = call('slots', {'group': G1, 'theme': ['st-riot'], 'count': 6}); assert code == 200 and result['reference'] == 6 and len(result['slots']) == 6, result
    samples = set()
    for slot in result['slots']:
        assert not {'event', 'time', 'genre'} & set(slot), slot  # the theme covers Event, the group Genre and Time
        assert slot['place'] in ('st-paris', 'st-milano') and slot['object'] in ('st-tram', 'st-cart'), slot  # only the group's REAL
        assert slot['medium'] == 'st-newsprint' and slot['color'] == 'st-bw', slot
        assert slot['sample'] in {f'slopt-{i}' for i in range(6)}, slot; samples.add(slot['sample'])
    assert len(samples) == 6, samples  # a different REAL campione per slot while there are any
    # Two combinations exist in this group (each place with its object): both come out before any repetition.
    assert len({json.dumps({k: v for k, v in s.items() if k != 'sample'}, sort_keys=True) for s in result['slots'][:2]}) == 2, result['slots']
    code, other = call('slots', {'group': G2, 'count': 3}); assert code == 200 and all(s['object'] in ('st-bus', 'st-radio') and s['event'] == 'st-riot' for s in other['slots']), other
    # Redrawing one slot with the others as existing: it avoids their combinations when it can.
    others = result['slots'][:1]
    code, again = call('slots', {'group': G1, 'theme': ['st-riot'], 'count': 1, 'existing': others}); assert code == 200, again
    assert {k: v for k, v in again['slots'][0].items() if k != 'sample'} != {k: v for k, v in others[0].items() if k != 'sample'}, again
    # --- Paid part: a batch of a group, its prompts, its images. ---
    code, batch = call('batches', {'group': G1, 'theme': ['st-riot'], 'slots': result['slots'][:3]})
    assert code == 200 and batch['group'] == G1 and batch['prompts'] == [] and batch['images'] == [], batch
    assert all(s['sample'] == r['sample'] for s, r in zip(batch['slots'], result['slots'][:3])), batch['slots']  # the samples are kept
    bid = batch['id']
    assert call('batches', {'theme': ['st-riot'], 'slots': result['slots'][:1]})[0] == 400 and call('batches', {'group': G1, 'slots': []})[0] == 400
    before = len(calls())
    openai([])
    for wrong in ({}, {'confirm': False}, {'confirm': True, 'index': 9}, {'confirm': True, 'other': 1}):
        assert call(f'batches/{bid}/prompts', wrong)[0] == 400, wrong
    assert openai() == [] and len(calls()) == before  # nothing sent, nothing recorded
    code, batch = call(f'batches/{bid}/prompts', {'confirm': True}); assert code == 200 and batch['prompts_status'] == 'done', batch
    assert len(batch['prompts']) == 3 and all(p['prompt'].startswith('A documentary photograph: st-riot') for p in batch['prompts']), batch['prompts']
    [sent] = openai()
    body = sent['body']; assert body['model'] == 'gpt-6.1-terra' and body['text']['format']['name'] == 'slop_prompts', body['model']
    assert body['instructions'].startswith('Lavori per un archivio') and 'Scrivi prompt per un generatore' in body['instructions']
    assert 'Write every prompt in English, between 600 and 1000 characters' in body['instructions'] and 'names of people in the examples are never used' in body['instructions']
    assert body['max_output_tokens'] == 16000, body['max_output_tokens']
    request = json.loads(body['input'][0]['content'][0]['text'])
    assert request['theme'] == ['st-riot'] and request['group'] == {'genre': 'st-press', 'decade': '1910s'}, request
    assert request['slots'] == [{k: v for k, v in s.items() if k != 'sample'} for s in result['slots'][:3]], request  # the REAL campione never reaches the model
    assert len(request['examples']) == 6 and all(e['description'].startswith('Disordini in strada') and 'st-press' in e['tags'] for e in request['examples']), request['examples']
    assert calls()[-1] == {'kind': 'prompts', 'model': 'gpt-6.1-terra', 'status': 'completed'}
    # The owner edits a prompt (free); one prompt is rewritten (paid) and the others stay.
    edited = [p['prompt'] for p in batch['prompts']]; edited[2] = 'Edited by the owner: a street with st-riot'
    code, batch = call(f'batches/{bid}', {'prompts': edited}, method='PUT'); assert code == 200 and batch['prompts'][2]['prompt'].startswith('Edited'), batch
    assert call(f'batches/{bid}', {'prompts': edited[:2]}, method='PUT')[0] == 400
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
    tags0 = {k: v for k, v in result['slots'][0].items() if k != 'sample'}
    assert first['generation'] == {'batch': bid, 'group': G1, 'quality': 'medium',
                                   'slot': {'index': 0, 'group': G1, 'theme': ['st-riot'], 'tags': tags0, 'sample': result['slots'][0]['sample']}}, first['generation']
    code, groups_now = call('spread'); assert {g['key']: g for g in groups_now['groups']}[G1]['fresh'] == 1  # a new SLOP counts in its group before the analysis
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
    sample = {'id': result['slots'][0]['sample'], 'metrics': {**metrics, 'long': 700, 'noise': 4}}
    treatment = {'version': 1, 'off': False, 'seed': 7, 'long': 96, 'medium': 'newspaper-print', 'color': 'black-and-white', 'sample': sample}
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
assert 'st-riot' not in {t['label'] for t in call('spread')[1]['tags']}
print('SLOP studio integration passed: groups of genre and decade with threshold and room, reference, slots inside a group with a REAL campione each; batches of a group, prompts with examples (all and one), edits, images from the prompt only, refusals and uncertain outcomes, copy with measures and treatment, analysis of a generated SLOP.')
