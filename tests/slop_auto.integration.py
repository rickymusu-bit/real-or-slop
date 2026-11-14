"""Automatic SLOP batches through the API with the fake OpenAI: proposal from the counts, ignore, settings, confirmation
checked again, one open batch, prompts once, each slot sent once, stop, review, closing and recovery. Runs last: it moves every
earlier image to the trash first."""
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
state = os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
LIBRARY = base + '/api/admin/library'
AUTO = LIBRARY + '/slop/auto'
fake = os.environ['ROS_TEST_FAKE_OPENAI']

def call(url, data=None, method=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def openai(queue=None):
    req = urllib.request.Request(fake + '/control', data=json.dumps({'queue': queue}).encode() if queue is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read()).get('log')
def sql(command, check=True):
    out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command, '--json'],
                         capture_output=True, text=True, check=check)
    return json.loads(out.stdout)[-1]['results'] if out.returncode == 0 else None
def settings(**values):
    code, result = call(LIBRARY + '/settings', values, 'PUT'); assert code == 200, result
    return result['values']

# A clean field: every earlier image goes to the trash (trash never counts), no group is open.
sql("UPDATE images SET trashed_from=CASE status WHEN 'new' THEN 'new' ELSE 'approved' END,status='trash' WHERE status<>'trash'; DELETE FROM slop_batches; DELETE FROM slop_proposal_ignored")
code, current = call(LIBRARY + '/settings'); assert code == 200 and current['values']['slop_auto_enabled'] == 1 and current['values']['slop_auto_threshold_percent'] == 33, current
assert current['limits']['slop_auto_threshold_percent'] == {'min': 1, 'max': 100, 'default': 33}, current['limits']
settings(slop_section_min_real=50, slop_group_min_real=5)

# 60 REAL approved. Groups: au-arch/1860s (24 REAL, three places), au-mid/1870s (15 REAL), au-small/1880s (4 REAL: below the 5 of a
# group); 17 without a group. SLOP approved: 4 au-arch/1860s, 10 au-mid/1870s (15 REAL and 10 SLOP: 33.3%). SLOP new in au-arch/1860s:
# one from the analysis, one from the group it was generated for.
labels = {'au-arch': 'genre', 'au-mid': 'genre', 'au-small': 'genre', '1860s': 'time', '1870s': 'time', '1880s': 'time',
          'au-roma': 'place', 'au-napoli': 'place', 'au-milano': 'place'}
statements = ['INSERT OR IGNORE INTO tags(id,label,category,created_at) VALUES ' + ','.join(f"('au-tag-{l}','{l}','{c}','x')" for l, c in labels.items())]
def add(i, origin, tags, status='approved', group=None):
    h = format(10_000 + i, '064x')
    statements.append(f"INSERT INTO images(id,origin,status,title,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,created_at,updated_at,generation_group) "
                      f"VALUES('auto-{i}','{origin}','{status}','a{i}','auto/{i}','{h}','image/jpeg',10,10,'auto/c{i}','{h}','x','x',{repr(group) if group else 'NULL'})")
    if tags: statements.append('INSERT INTO image_tags(image_id,tag_id) VALUES ' + ','.join(f"('auto-{i}','au-tag-{l}')" for l in tags))
for i in range(60):
    add(i, 'REAL', ['au-arch', '1860s', ['au-roma', 'au-napoli', 'au-milano'][i % 3]] if i < 24 else ['au-mid', '1870s'] if i < 39
        else ['au-small', '1880s'] if i < 43 else ['au-roma'] if i < 48 else [])
for i in range(100, 104): add(i, 'SLOP', ['au-arch', '1860s'])
for i in range(110, 120): add(i, 'SLOP', ['au-mid', '1870s'])
add(200, 'SLOP', ['au-arch', '1860s'], 'new')
add(201, 'SLOP', [], 'new', 'au-arch/1860s')
A, B = 'au-arch/1860s', 'au-mid/1870s'
sql('; '.join(statements))
try:
    code, auto = call(AUTO); assert code == 200 and auto['enabled'] and auto['batch'] is None and auto['paid_calls'], auto
    p = auto['proposal']
    assert {k: p[k] for k in ('group', 'genre', 'time', 'n_real', 'n_slop', 'n_new', 'spread', 'missing', 'size')} == \
        {'group': A, 'genre': 'au-arch', 'time': '1860s', 'n_real': 24, 'n_slop': 4, 'n_new': 2, 'spread': 20, 'missing': 18, 'size': 10}, p
    assert round(p['spread_percent']) == 83
    # Ignored: the next candidate (au-mid/1870s, 33.3%, 5 missing); au-small/1880s never, with 4 REAL.
    code, auto = call(AUTO + '/ignore', {'group': A}); assert code == 200 and auto['proposal']['group'] == B and auto['proposal']['size'] == 5, auto
    assert call(AUTO + '/ignore', {'group': 'au-none/1990s'})[0] == 404 and call(AUTO + '/ignore', {})[0] == 400 and call(AUTO + '/ignore', {'tag': 'au-arch'})[0] == 400
    settings(slop_auto_threshold_percent=34)
    code, auto = call(AUTO); assert auto['proposal'] is None and auto['reason'] == 'none', auto
    settings(slop_auto_threshold_percent=33, slop_auto_enabled=0)
    code, auto = call(AUTO); assert auto['proposal'] is None and auto['reason'] == 'disabled', auto
    settings(slop_auto_enabled=1)
    assert call(LIBRARY + '/settings', {'slop_auto_enabled': 2}, 'PUT')[0] == 400 and call(LIBRARY + '/settings', {'slop_auto_threshold_percent': 0}, 'PUT')[0] == 400
    sql("DELETE FROM slop_proposal_ignored")
    code, auto = call(AUTO); assert auto['proposal']['group'] == A, auto

    # Start: confirmation required, the proposal checked again.
    openai([])
    assert call(AUTO + '/start', {'group': A, 'size': 10})[0] == 400
    assert call(AUTO + '/start', {'group': A, 'size': 10, 'confirm': True, 'x': 1})[0] == 400
    code, result = call(AUTO + '/start', {'group': A, 'size': 9, 'confirm': True}); assert code == 409 and 'cambiata' in result['error'], result
    code, result = call(AUTO + '/start', {'group': B, 'size': 5, 'confirm': True}); assert code == 409, result
    code, auto = call(AUTO + '/start', {'group': A, 'size': 10, 'confirm': True}); assert code == 200, auto
    batch = auto['batch']; bid = batch['id']
    assert batch['group'] == A and batch['status'] == 'running' and batch['slots'] == 10 and batch['size'] == 10 and batch['attempted'] == [], batch
    assert batch['prompts_status'] == 'none' and batch['snapshot']['missing'] == 18 and auto['proposal'] is None and auto['reason'] == 'batch_open', auto
    assert openai() == [], 'starting a batch sends nothing'
    [row] = sql(f"SELECT theme,slots,origin,group_key FROM slop_batches WHERE id='{bid}'")
    slots = json.loads(row['slots'])
    assert row['origin'] == 'auto' and json.loads(row['theme']) == [] and row['group_key'] == A, row
    assert all(not {'genre', 'time'} & set(s) and s['place'] in ('au-roma', 'au-napoli', 'au-milano') and s['sample'].startswith('auto-') for s in slots), slots
    assert call(AUTO + '/start', {'group': A, 'size': 10, 'confirm': True})[0] == 409
    assert sql(f"INSERT INTO slop_batches(id,theme,slots,created_at,updated_at,origin,auto_tag,auto_status) VALUES('dup','[]','[]','x','x','auto','x','review')", check=False) is None, \
        'the database allows one open automatic batch only'
    # The studio does not list it nor edit it; prompts once, images only after the prompts.
    code, listing = call(LIBRARY + '/slop/batches'); assert code == 200 and all(b['id'] != bid for b in listing['batches']), listing
    assert call(LIBRARY + f'/slop/batches/{bid}', {'prompts': ['x'] * 10}, 'PUT')[0] == 409
    code, result = call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 0, 'quality': 'medium'}); assert code == 409 and 'Prima i prompt' in result['error'], result
    assert call(LIBRARY + f'/slop/batches/{bid}/prompts', {'confirm': True, 'index': 0})[0] == 409
    code, written = call(LIBRARY + f'/slop/batches/{bid}/prompts', {'confirm': True}); assert code == 200 and written['prompts_status'] == 'done' and len(written['prompts']) == 10, written
    assert call(LIBRARY + f'/slop/batches/{bid}/prompts', {'confirm': True})[0] == 409
    assert len(openai()) == 1
    # Each slot goes to the generator at most once; a refused request (no confirmation, wrong quality) does not use up the slot.
    openai([])
    code, first = call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 0, 'quality': 'medium'})
    assert code == 200 and first['generation']['batch'] == bid and first['generation']['group'] == A, first
    code, result = call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 0, 'quality': 'medium'}); assert code == 409 and 'già stato inviato' in result['error'], result
    assert call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 10, 'quality': 'medium'})[0] == 400
    assert call(LIBRARY + f'/slop/batches/{bid}/images', {'index': 2, 'quality': 'medium'})[0] == 400
    assert call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 2, 'quality': 'ultra'})[0] == 400
    openai([{'status': 503}])
    assert call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 1, 'quality': 'medium'})[0] == 502
    code, result = call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 1, 'quality': 'medium'}); assert code == 409, 'an uncertain outcome is never resent'
    code, third = call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 2, 'quality': 'medium'}); assert code == 200, third
    assert [s['path'] for s in openai()] == ['/v1/images/generations'] * 2
    code, auto = call(AUTO); assert sorted(auto['batch']['attempted']) == [0, 1, 2] and auto['batch']['undecided'] == 2 and auto['proposal'] is None, auto['batch']
    # Stop: no more calls; the batch waits for the decisions and blocks every proposal.
    code, auto = call(AUTO + '/stop', {}); assert code == 200 and auto['batch']['status'] == 'review', auto
    assert call(AUTO + '/stop', {})[0] == 409
    code, result = call(LIBRARY + f'/slop/batches/{bid}/images', {'confirm': True, 'index': 3, 'quality': 'medium'}); assert code == 409 and 'non è più in generazione' in result['error'], result
    code, listing = call(LIBRARY + '?' + 'status=library&origin=all&batch=' + bid); assert code == 200 and {i['id'] for i in listing['items']} == {first['id'], third['id']}, listing['items']
    assert call(LIBRARY + '?batch=bad%20id')[0] == 400
    # Deciding the images closes the batch; the proposal comes back. Trashed images do not count, a recovered one is a new SLOP.
    assert call(LIBRARY + f'/{first["id"]}/trash', {})[0] == 200
    code, auto = call(AUTO); assert auto['batch']['undecided'] == 1 and auto['proposal'] is None, auto
    assert call(LIBRARY + f'/{third["id"]}/trash', {})[0] == 200
    code, auto = call(AUTO); assert auto['batch'] is None and auto['proposal']['group'] == A and auto['proposal']['missing'] == 18, auto
    [row] = sql(f"SELECT auto_status FROM slop_batches WHERE id='{bid}'"); assert row['auto_status'] == 'closed'
    assert call(LIBRARY + f'/{first["id"]}/restore', {})[0] == 200
    code, auto = call(AUTO); assert auto['batch'] is None and auto['proposal']['n_new'] == 3 and auto['proposal']['missing'] == 17, auto
    # A batch finished without images closes at once.
    code, auto = call(AUTO + '/start', {'group': A, 'size': 10, 'confirm': True}); assert code == 200, auto
    code, auto = call(AUTO + '/finish', {}); assert code == 200 and auto['batch'] is None and auto['proposal']['group'] == A, auto
finally:
    for row in sql("SELECT id FROM images WHERE id LIKE 'auto-%' OR generation_batch IN (SELECT id FROM slop_batches WHERE origin='auto')") or []:
        call(LIBRARY + f'/{row["id"]}/trash', {}); call(LIBRARY + f'/{row["id"]}', method='DELETE')
    sql("DELETE FROM images WHERE id LIKE 'auto-%'; DELETE FROM tags WHERE id LIKE 'au-tag-%'; DELETE FROM slop_batches; DELETE FROM slop_proposal_ignored")
    settings(slop_auto_enabled=1, slop_auto_threshold_percent=33)
print('Automatic SLOP batches integration passed: proposal of a group from the counts, ignore, settings, confirmation checked again, one open batch, prompts once, '
      'each slot sent once, stop, review and Database filter, closing and recovery.')
