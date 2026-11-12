"""v1.2.0, 2026-11-12T08:00:00Z: images asked in 4:5 (1024×1280 with gpt-image-2.5-flare), game copy in 4:5.
v1.1.0, 2026-11-11T05:40:53Z: paid part against the fake OpenAI (tests/fake_openai.v1.3.0.py): groups, prompts written in one
call with the SLOP context and rewritten one at a time, edits, uncertain and refused calls, images generated from the
prompt text only and stored as new SLOP with group, slot and quality, then analysed like the REAL.
v1.0.0, 2026-11-10T22:11:48Z: SLOP studio, free part (docs/wizard-slop.v1.4.0.md, sections 2–4), against a LOCAL Worker:
spread of each tag among approved and published images, thresholds (50 REAL for the section, 10 for a theme), live count
of the theme, slots drawn from the REAL images with the theme, coherent by epoch, no paid call."""
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

code, spread = call('spread'); assert code == 200 and spread['thresholds'] == {'section': 50, 'theme': 10, 'max_slots': 10}, spread
if spread['real_total'] < 50:
    code, result = call('slots', {'theme': ['riot'], 'count': 1}); assert code == 409 and 'almeno 50' in result['error'], result

# 60 REAL and 2 SLOP, approved, with tags in their categories: 12 REAL with st-riot, 6 in the 1910s and 6 in the 1920s.
statements, tags = [], {'st-riot': 'event', '1910s': 'time', '1920s': 'time', 'st-carnival': 'event', 'st-paris': 'place', 'st-milano': 'place',
                        'st-tram': 'object', 'st-cart': 'object', 'st-bus': 'object', 'st-radio': 'object', 'st-filler': 'other'}
statements.append('INSERT OR IGNORE INTO tags(id,label,category,created_at) VALUES ' + ','.join(f"('st-tag-{l}','{l}','{c}','x')" for l, c in tags.items()))
def add(i, origin, labels):
    h = format(i, '064x')
    statements.append(f"INSERT INTO images(id,origin,status,title,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,created_at,updated_at) "
                      f"VALUES('slopt-{i}','{origin}','approved','t{i}','slopt/{i}','{h}','image/jpeg',10,10,'slopt/c{i}','{h}','x','x')")
    statements.append('INSERT INTO image_tags(image_id,tag_id) VALUES ' + ','.join(f"('slopt-{i}','st-tag-{l}')" for l in labels))
for i in range(60):
    if i < 6: add(i, 'REAL', ['st-riot', '1910s', ['st-paris', 'st-milano'][i % 2], ['st-tram', 'st-cart'][i % 2]])
    elif i < 12: add(i, 'REAL', ['st-riot', '1920s', ['st-paris', 'st-milano'][i % 2], ['st-bus', 'st-radio'][i % 2]])
    elif i < 16: add(i, 'REAL', ['st-carnival', 'st-filler'])
    else: add(i, 'REAL', ['st-filler'])
add(1000, 'SLOP', ['st-riot', '1910s']); add(1001, 'SLOP', ['st-riot'])
sql('; '.join(statements))
try:
    code, spread = call('spread'); assert code == 200 and spread['real_total'] >= 60 and spread['slop_total'] >= 2, spread
    rows = {t['label']: t for t in spread['tags']}
    assert rows['st-riot'] == {'label': 'st-riot', 'category': 'event', 'real': 12, 'slop': 2, 'spread': 10}, rows['st-riot']
    assert rows['1910s']['spread'] == 5 and rows['st-filler']['spread'] == 48, rows
    spreads = [t['spread'] for t in spread['tags']]; assert spreads == sorted(spreads, reverse=True)  # by spread, largest first
    assert call('theme', {'theme': ['st-riot']})[1]['reference'] == 12
    assert call('theme', {'theme': ['st-riot', '1910s']})[1]['reference'] == 6
    assert call('theme', {'theme': ['st-carnival']})[1]['reference'] == 4
    code, result = call('slots', {'theme': ['st-carnival'], 'count': 2}); assert code == 409 and 'ne servono 10' in result['error'], result
    for wrong in ({'theme': [], 'count': 1}, {'theme': ['st-riot'], 'count': 11}, {'theme': ['st-riot'], 'count': 0}, {'theme': ['st-unknown'], 'count': 1},
                  {'theme': ['st-riot'], 'count': 1, 'extra': 1}, {'theme': ['st-riot'], 'count': 1, 'existing': 'x'}):
        assert call('slots', wrong)[0] == 400, wrong
    code, result = call('slots', {'theme': ['st-riot'], 'count': 6}); assert code == 200 and result['reference'] == 12 and len(result['slots']) == 6, result
    for slot in result['slots']:
        assert 'event' not in slot and slot['time'] in ('1910s', '1920s'), slot
        assert slot['place'] in ('st-paris', 'st-milano'), slot
        assert (slot['object'] in ('st-tram', 'st-cart')) == (slot['time'] == '1910s'), slot  # objects of the same epoch
    # Only 4 combinations exist in these REAL (2 epochs × 2 places, one object each): all 4 come out before any repetition.
    assert len({json.dumps(s, sort_keys=True) for s in result['slots']}) == 4, result['slots']
    code, again = call('slots', {'theme': ['st-riot', '1910s'], 'count': 1}); assert code == 409 and 'compare in 6' in again['error'], again
    # Redrawing one slot with the others as existing: it avoids their combinations when it can.
    others = [s for s in result['slots'] if s['time'] == '1910s'][:1]
    code, again = call('slots', {'theme': ['st-riot'], 'count': 1, 'existing': others}); assert code == 200 and again['slots'][0] != others[0], again
    # --- Paid part: a group, its prompts, its images. ---
    code, batch = call('batches', {'theme': ['st-riot'], 'slots': result['slots'][:3]}); assert code == 200 and batch['prompts'] == [] and batch['images'] == [], batch
    bid = batch['id']
    assert call('batches', {'theme': [], 'slots': result['slots'][:1]})[0] == 400 and call('batches', {'theme': ['st-riot'], 'slots': []})[0] == 400
    before = len(calls())
    openai([])
    for wrong in ({}, {'confirm': False}, {'confirm': True, 'index': 9}, {'confirm': True, 'other': 1}):
        assert call(f'batches/{bid}/prompts', wrong)[0] == 400, wrong
    assert openai() == [] and len(calls()) == before  # nothing sent, nothing recorded
    code, batch = call(f'batches/{bid}/prompts', {'confirm': True}); assert code == 200 and batch['prompts_status'] == 'done', batch
    assert len(batch['prompts']) == 3 and all(p['prompt'].startswith('A documentary photograph: st-riot') for p in batch['prompts']), batch['prompts']
    [sent] = openai()
    body = sent['body']; assert body['model'] == 'gpt-6.1-terra' and body['text']['format']['name'] == 'slop_prompts', body['model']
    assert body['instructions'].startswith('Lavori per un archivio') and 'Scrivi prompt per un generatore' in body['instructions'] and 'Write every prompt in English' in body['instructions']
    request = json.loads(body['input'][0]['content'][0]['text']); assert request['theme'] == ['st-riot'] and request['slots'] == result['slots'][:3], request
    assert calls()[-1] == {'kind': 'prompts', 'model': 'gpt-6.1-terra', 'status': 'completed'}
    # The owner edits a prompt (free); one prompt is rewritten (paid) and the others stay.
    edited = [p['prompt'] for p in batch['prompts']]; edited[2] = 'Edited by the owner: a street with st-riot'
    code, batch = call(f'batches/{bid}', {'prompts': edited}, method='PUT'); assert code == 200 and batch['prompts'][2]['prompt'].startswith('Edited'), batch
    assert call(f'batches/{bid}', {'prompts': edited[:2]}, method='PUT')[0] == 400
    openai([{'json': {'prompts': [{'prompt': 'Rewritten: st-riot at dusk', 'used_tags': []}]}}])
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
    assert first['generation'] == {'batch': bid, 'slot': {'index': 0, 'theme': ['st-riot'], 'tags': result['slots'][0]}, 'quality': 'medium'}, first['generation']
    assert (first['width'], first['height']) == (64, 80)
    code, second = call(f'batches/{bid}/images', {'confirm': True, 'index': 1, 'quality': 'max'}); assert code == 200 and (second['width'], second['height']) == (64, 80), second
    sent = openai(); assert [s['path'] for s in sent] == ['/v1/images/generations'] * 2
    assert sent[0]['body'] == {'model': 'gpt-image-2.5-flare', 'prompt': batch['prompts'][0]['prompt'], 'n': 1, 'size': '1024x1280', 'quality': 'medium'}, sent[0]['body']
    assert sent[1]['body']['size'] == '1024x1280'  # every image 4:5, no rotation of formats
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
    from game_copy_v2_0_0 import game_copy
    code, original = 200, urllib.request.urlopen(urllib.request.Request(LIBRARY + f'/{first["id"]}/original', headers={'Authorization': 'Bearer ' + token})).read()
    code, first = call(f'/{first["id"]}/copy', raw=game_copy(original), mime='image/webp', url=LIBRARY); assert code == 201, first
    openai([])
    code, first = call(f'/{first["id"]}/analyze', {'confirm': True}, url=LIBRARY); assert code == 200 and first['tags'] == ['crowd', 'street'], first
    [sent] = openai(); assert 'Description: ' + first['prompt'] in sent['body']['input'][0]['content'][0]['text']
    assert not any(word in json.dumps(sent['body']) for word in ('SLOP', 'REAL', 'slop_prompts')), 'the analysis must not know the origin'
finally:
    for row in sql_rows("SELECT id FROM images WHERE generation_batch IS NOT NULL"):
        call(f'/{row["id"]}/trash', {}, url=LIBRARY); call(f'/{row["id"]}', method='DELETE', url=LIBRARY)
    sql("DELETE FROM images WHERE id LIKE 'slopt-%'; DELETE FROM slop_batches")
assert 'st-riot' not in {t['label'] for t in call('spread')[1]['tags']}
print('SLOP studio integration passed: spread, thresholds, slots; groups, prompts (all and one), edits, images from the prompt only, refusals and uncertain outcomes, analysis of a generated SLOP.')
