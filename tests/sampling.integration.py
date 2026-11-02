"""Catalog/filter/deduplication checks on isolated LOCAL D1, HTTP and PvP."""
import hashlib
import time
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid

base = os.environ.get('ROS_TEST_BASE', 'http://127.0.0.1:8787')
prefix = 'sampling_' + uuid.uuid4().hex
profile = os.environ.get('ROS_TEST_PROFILE', 'local')
profile_args = ['--env', profile] if profile else []
state = os.environ.get('ROS_TEST_STATE', '.wrangler/integration')
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
sessions = []
players = []

def sql(command):
    # All SQL identifiers/values below are generated test data, never user input.
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as file:
        file.write(command)
        path = file.name
    try:
        result = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local',
                                 '--persist-to', state, '--file', path, '--json', *profile_args],
                                capture_output=True, text=True, check=True)
        return json.loads(result.stdout)
    finally:
        Path(path).unlink()

def request(path, method='GET', data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base+path, method=method, headers=headers,
                                 data=json.dumps(data).encode() if data is not None else None)
    try:
        with client.open(req) as response: return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error: return error.code, json.loads(error.read())

def private(payload):
    text = json.dumps(payload)
    for key in ['curation', 'subject_kind', 'image_medium', 'country_or_region',
                'sha256', 'perceptual_hash', 'diagnostics', 'perceived_plausibility', prefix, 'PRIVATE_SAMPLING']:
        assert key not in text, key

setup = [f"INSERT INTO categories VALUES('{prefix}','Sampling fixture',NULL)"]
for i, (kind, variant, status, demo, legacy_difficulty) in enumerate([
    ('REAL', 0, 'approved', 1, 'facile'), ('REAL', 1, 'approved', 1, 'facile'),
    ('AI', 0, 'approved', 1, 'facile'), ('AI', 1, 'approved', 1, 'facile'),
    ('REAL', 0, 'approved', 1, 'facile'),  # near duplicate of row 0
    ('REAL', 0, 'in-review', 1, 'difficile'),
    ('REAL', 0, 'approved', 0, 'difficile'), ('AI', 1, 'approved', 0, 'difficile'),
    ('AI', 1, 'approved', 1, 'difficile'),
]):
    image = prefix + '_' + str(i)
    phash = ['0000000000000000', 'ffffffffffffffff', 'a5a5a5a5a5a5a5a5',
             '5a5a5a5a5a5a5a5a', '000000000000001f', '1234567812345678',
             '9876543298765432', 'f0f0f0f0f0f0f0f0', 'd3d3d3d3d3d3d3d3'][i]
    setup.append(f"INSERT INTO images(id,type,title,description,author,authenticity_evidence,r2_key,ai_model,ai_prompt,status,sha256,perceptual_hash,explanation,demo) VALUES('{image}','{kind}','PRIVATE_SAMPLING','fixture','fixture','fixture','{image}','fixture','fixture','{status}','{image}','{phash}','Fixture reveal',{demo})")
    setup.append(f"INSERT INTO image_categories VALUES('{image}','{prefix}')")
    medium = 'foto_bn' if variant == 0 else 'foto_colori'
    plausibility = 'ordinaria' if variant == 0 else 'sorprendente'
    setup.append(f"INSERT INTO image_curation(image_id,subject_kind,country_or_region,period_bucket,image_medium,composition,perceived_plausibility,revision,reviewer,updated_at) VALUES('{image}','trasporti','europa','1900_1945','{medium}','scena_ampia','{plausibility}',1,'fixture','2026-10-25')")
try:
    members = json.dumps([prefix+'_'+str(n) for n in (0,1,2,3,4,8)])
    setup.append(f"INSERT INTO publication_batches VALUES('{prefix}','{members}','fixture','2026-11-01T00:00:00Z')")
    sql(';\n'.join(setup) + ';')
    filters = dict(categories=[prefix], difficulty='facile')
    status, created = request('/api/sessions', 'POST', dict(mode='training', count=8, **filters))
    assert status == 201, (status, created)
    private(created)
    assert any('duplicate' in warning for warning in created['warnings'])
    assert any('ridotto' in warning for warning in created['warnings'])
    sessions.append(created['id'])
    sid = created['id']
    for _ in range(2):
        _, view = request('/api/sessions/'+sid)
        private(view)
        assert view['total'] == 2 and not view['done']
        assert set(view['question']) == {'id', 'number', 'image', 'alt'}
        assert request('/api/sessions/'+sid+'/ready', 'POST', dict(roundId=view['question']['id']))[0] == 200
        assert request('/api/sessions/'+sid+'/answer', 'POST', dict(roundId=view['question']['id'], choice='REAL'))[0] == 200
    end = request('/api/sessions/'+sid)[1]
    assert end['score'] == 100 * sum(c['answer'] == 'REAL' for c in end['credits'])

    status, timed = request('/api/sessions', 'POST', dict(mode='timed', count=8, roundSeconds=20, **filters))
    assert status == 201, timed
    sessions.append(timed['id'])
    _, view = request('/api/sessions/'+timed['id'])
    private(view)
    assert view['phase'] == 'preparing' and view['expiresAt'] is None
    _, manifest = request('/api/sessions/'+timed['id']+'/manifest')
    _, view = request('/api/sessions/'+timed['id']+'/start', 'POST', dict(prepared=True, roundIds=[q['id'] for q in manifest['images']]))
    assert view['total'] == 2 and 19000 < view['expiresAt'] - view['serverNow'] <= 20000
    retired_status, retired_game = request('/api/sessions', 'POST', dict(mode='training', count=8, categories=[prefix], difficulty='difficile'))
    assert retired_status == 201
    sessions.append(retired_game['id'])
    assert request('/api/sessions', 'POST', dict(mode='training', count=8, categories=[prefix+'_missing']))[0] == 409

    # Inspect real persisted assignments, not only the response shape.
    selected = sql(f"SELECT i.id,i.type,i.status,i.demo,i.perceptual_hash,c.image_medium,r.session_id FROM game_rounds r JOIN images i ON i.id=r.image_id LEFT JOIN image_curation c ON c.image_id=i.id WHERE r.session_id IN ('{sessions[0]}','{sessions[1]}')")[0]['results']
    for session in sessions[:2]:
        rows = [row for row in selected if row['session_id'] == session]
        assert len(rows) == 2 and len({row['id'] for row in rows}) == 2
        assert all(row['status'] == 'approved' and row['demo'] == 1 for row in rows)
        assert sum(row['perceptual_hash'] in ['0000000000000000', '000000000000001f'] for row in rows) <= 1
        assert {row['image_medium'] for row in rows} == {'foto_bn', 'foto_colori'}

    # Previously assigned sessions are read unchanged, even if they exceed the
    # new per-class capacity. GET/reconnect must never redraw their rounds.
    legacy = str(uuid.uuid4())
    sessions.append(legacy)
    owner = hashlib.sha256(next(c.value for c in jar if c.name == 'ros_owner').encode()).hexdigest()
    legacy_sql = [f"INSERT INTO game_sessions(id,mode,created_at,owner_hash) VALUES('{legacy}','training',{int(time.time()*1000)},'{owner}')"]
    for position in range(4):
        legacy_sql.append(f"INSERT INTO game_rounds(id,session_id,image_id,position) VALUES('{uuid.uuid4()}','{legacy}','{prefix}_{position}',{position})")
    sql(';'.join(legacy_sql)+';')
    _, legacy_view = request('/api/sessions/'+legacy)
    assert legacy_view['total'] == 4
    assert request('/api/sessions/'+legacy)[1]['question'] == legacy_view['question']
    single = prefix + '-single'
    sql(f"INSERT INTO categories VALUES('{single}','Single-class fixture',NULL); INSERT INTO image_categories VALUES('{prefix}_4','{single}');")
    assert request('/api/sessions','POST',dict(mode='training',count=8,categories=[single]))[0] == 409
    assert request('/api/rooms','POST',dict(count=8,categories=[single]))[0] == 503
    print('Sampling integration passed: retired difficulty/category/environment/publication filters, real D1 assignments, near duplicates, preflight capacity, legacy assignments, opaque warnings, Training/Timed and suspended public PvP.')

finally:
    cleanup = []
    for session in sessions:
        cleanup += [f"DELETE FROM answers WHERE round_id IN (SELECT id FROM game_rounds WHERE session_id='{session}')",
                    f"DELETE FROM game_rounds WHERE session_id='{session}'",
                    f"DELETE FROM game_sessions WHERE id='{session}'"]
    cleanup += [f"DELETE FROM challenge_answers WHERE challenge_id IN (SELECT id FROM challenges WHERE settings LIKE '%{prefix}%')",
                f"DELETE FROM challenge_players WHERE challenge_id IN (SELECT id FROM challenges WHERE settings LIKE '%{prefix}%')",
                f"DELETE FROM challenges WHERE settings LIKE '%{prefix}%'",]
    cleanup += [f"DELETE FROM players WHERE id='{player}'" for player in players]
    cleanup += [f"DELETE FROM published_images WHERE image_id LIKE '{prefix}%'",]
    cleanup += [f"DELETE FROM image_curation WHERE image_id LIKE '{prefix}%'",
                f"DELETE FROM image_categories WHERE image_id LIKE '{prefix}%'",
                f"DELETE FROM images WHERE id LIKE '{prefix}%'", f"DELETE FROM categories WHERE id LIKE '{prefix}%'"]
    sql(';\n'.join(cleanup) + ';')
