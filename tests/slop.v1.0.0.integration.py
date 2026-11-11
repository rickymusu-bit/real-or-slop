"""v1.0.0, 2026-11-10T22:11:48Z: SLOP studio, free part (docs/wizard-slop.v1.4.0.md, sections 2–4), against a LOCAL Worker:
spread of each tag among approved and published images, thresholds (50 REAL for the section, 10 for a theme), live count
of the theme, slots drawn from the REAL images with the theme, coherent by epoch, no paid call."""
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

def call(path, data=None):
    req = urllib.request.Request(API + path, data=json.dumps(data).encode() if data is not None else None, method='POST' if data is not None else 'GET',
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
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
finally:
    sql("DELETE FROM images WHERE id LIKE 'slopt-%'")
assert 'st-riot' not in {t['label'] for t in call('spread')[1]['tags']}
print('SLOP studio integration passed: spread, thresholds, theme count, slots coherent by epoch, no duplicates, variety with existing slots.')
