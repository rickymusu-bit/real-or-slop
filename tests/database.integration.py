"""Database section through the API: tag and origin filters, statistics on the current copy, edit of a published photo
during a game (the game keeps its copy), regeneration of a SLOP (confirmed, statistics reset, new analysis), distribution."""
from local_db import sql
import http.cookiejar
import io
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image
from game_copy import game_copy

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
state, fake = os.environ['ROS_TEST_STATE'], os.environ['ROS_TEST_FAKE_OPENAI']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
API = base + '/api/admin/library'
IMAGES = 'real-or-slop-approved-local'

def call(url, data=None, method=None, raw=None, mime='application/json', auth=True, opener=None):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    headers = {'Content-Type': mime, **({'Authorization': 'Bearer ' + token} if auth else {})}
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body is not None else 'GET'), headers=headers)
    try:
        with (opener or urllib.request.build_opener()).open(req) as r:
            payload = r.read()
            return r.status, (json.loads(payload) if r.headers.get('Content-Type', '').startswith('application/json') else payload)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
# The removed catalogue grouping cannot narrow a request silently.
assert call(API + '?group=press-photo%2F1960s')[0] == 400

def stored(key):
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / 'f'
        subprocess.run(['npx', 'wrangler', 'r2', 'object', 'get', f'{IMAGES}/{key}', '--file', str(target), '--local', '--env', 'local',
                        '--persist-to', state], capture_output=True)
        return target.exists() and target.stat().st_size > 0
def openai(queue=None):
    req = urllib.request.Request(fake + '/control', data=json.dumps({'queue': queue}).encode() if queue is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read()).get('log')
def picture(seed, size=(48, 32)):
    image = Image.new('RGB', size); image.putdata([(seed % 256, (x * 7 + seed) % 256, (y * 11) % 256) for y in range(size[1]) for x in range(size[0])])
    out = io.BytesIO(); image.save(out, 'PNG'); return out.getvalue()
def webp(source): return game_copy(source)
def add(origin, title, seed, tags, prompt=''):
    source = picture(seed)
    status, item = call(f'{API}/upload?' + urllib.parse.urlencode({'origin': origin, 'title': title, 'prompt': prompt}), raw=source, mime='image/png')
    assert status == 201, item
    status, item = call(f'{API}/{item["id"]}/copy', raw=webp(source), mime='image/webp'); assert status == 201, item
    status, item = call(f'{API}/{item["id"]}', {'revision': item['revision'], 'tags': tags,
                                                'tag_categories': {t: 'event' if t == 'db-riot' else 'place' if t == 'db-paris' else 'setting' for t in tags}}, method='PATCH')
    assert status == 200, item
    status, item = call(f'{API}/{item["id"]}/approve', {'rights_confirmed': True}); assert item['status'] == 'approved', item
    return item
def listing(**params):
    status, data = call(API + '?' + urllib.parse.urlencode(params)); assert status == 200, data
    return {i['id']: i for i in data['items']}

# Published images from earlier scripts would join the games: take them out first, so the game below uses only ours.
for row in sql("SELECT id FROM images WHERE status='published'"): call(f'{API}/{row["id"]}/withdraw', {})
real = add('REAL', 'Barricate', 3, ['db-riot', 'db-paris'])
slop = add('SLOP', 'Scontri', 5, ['db-riot'], prompt='A riot in a square, 1969')
beach = add('SLOP', 'Spiaggia', 7, ['db-beach'], prompt='A crowded beach, 1975')
ours = {real['id'], slop['id'], beach['id']}
status, real = call(f'{API}/{real["id"]}', {'revision': real['revision'], 'description': 'Catalog description searchable-marker'}, method='PATCH')
assert status == 200, real
for item in (real, slop): assert call(f'{API}/{item["id"]}/publish', {})[1]['status'] == 'published'

# Text search and filters remain combined across title, description and prompt.
assert set(listing(q='barrICATE', tags='db-riot')) == {real['id']}
assert set(listing(q='searchable-marker', tags='db-riot')) == {real['id']}
assert set(listing(q='crowded beach', tags='db-beach')) == {beach['id']}
assert not listing(q='crowded beach', origin='REAL')
assert not listing(q='crowded beach', status='published')
assert not listing(q='no-such-catalogue-text')
assert set(listing(q=slop['id'][:12])) == {slop['id']}
# Filters: one tag, all of several tags, any of several tags, origin.
assert set(listing(tags='db-riot')) == {real['id'], slop['id']}
assert set(listing(tags='db-riot,db-paris')) == {real['id']}
assert set(listing(tags='db-paris,db-beach', match='any')) == {real['id'], beach['id']}
assert set(listing(tags='db-riot', origin='SLOP')) == {slop['id']}
assert set(listing(tags='db-riot,db-unknown')) == set()
assert call(API + '?match=some')[0] == 400
item = listing(tags='db-riot')[real['id']]
assert item['stats'] == {'views': 0, 'correct': 0} and item['in_play'] == 0 and item['tags'] == ['db-paris', 'db-riot'], item

# Distribution: approved and published, overall and by tag, with the spread.
status, dist = call(API + '/distribution'); assert status == 200, dist
by_tag = {t['label']: t for t in dist['tags']}
assert by_tag['db-riot'] == {'label': 'db-riot', 'category': 'event', 'real_approved': 0, 'real_published': 1, 'slop_approved': 0,
                             'slop_published': 1, 'spread': 0}, by_tag['db-riot']
assert by_tag['db-beach']['slop_approved'] == 1 and by_tag['db-beach']['spread'] == -1, by_tag['db-beach']
assert dist['totals']['REAL']['published'] >= 1 and dist['totals']['SLOP']['approved'] >= 1, dist
assert [t['spread'] for t in dist['tags']] == sorted((t['spread'] for t in dist['tags']), reverse=True)

# A game in progress with these two photos, seeded in the local D1: the REAL is classified right, then, while the SLOP is on screen,
# the owner starts editing it; the game keeps its copy; the SLOP is classified wrong.
import hashlib, secrets, time
cookie = secrets.token_hex(16); sid = 'db-game-' + secrets.token_hex(4)
player = urllib.request.build_opener(); player.addheaders = [('Cookie', 'ros_owner=' + cookie)]
sql(f"INSERT INTO game_sessions(id,mode,level,created_at,owner_hash,phase,timing_mode,round_seconds) VALUES('{sid}','levels','facile',"
    f"{int(time.time() * 1000)},'{hashlib.sha256(cookie.encode()).hexdigest()}','active','per-image',20); "
    f"INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) SELECT '{sid}-0','{sid}',id,0,copy_key FROM images WHERE id='{real['id']}'; "
    f"INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) SELECT '{sid}-1','{sid}',id,1,copy_key FROM images WHERE id='{slop['id']}'")
for position, image_id in enumerate((real['id'], slop['id'])):
    status, view = call(f'{base}/api/sessions/{sid}', auth=False, opener=player)
    question = view['question']; assert question['id'] == f'{sid}-{position}', view
    assert call(f'{base}/api/sessions/{sid}/ready', {'roundId': question['id']}, auth=False, opener=player)[0] == 200
    if image_id == slop['id']:
        # Edit during the game: the photo leaves publication at once; the game keeps its copy.
        status, edited = call(f'{API}/{slop["id"]}/withdraw', {}); assert edited['status'] == 'approved' and edited['in_play'] == 1, edited
        held = sql(f"SELECT copy_key FROM images WHERE id='{slop['id']}'")[0]['copy_key']
        assert stored(held) and sql(f"SELECT count(*) AS n FROM retired_copies WHERE copy_key='{held}'")[0]['n'] == 1
        status, edited = call(f'{API}/{slop["id"]}', {'revision': edited['revision'], 'description': 'Descrizione modificata.'}, method='PATCH')
        assert status == 200 and edited['status'] == 'approved', edited
        status, again = call(f'{base}/api/sessions/{sid}', auth=False, opener=player)
        assert 'caption' not in again['question'], again['question']
        status, media = call(base + again['question']['image'], auth=False, opener=player); assert status == 200 and media[:4] == b'RIFF'
    status, answer = call(f'{base}/api/sessions/{sid}/answer', {'roundId': question['id'], 'choice': 'REAL'}, auth=False, opener=player)
    assert status == 200 and answer['correct'] == (image_id == real['id']), answer
status, view = call(f'{base}/api/sessions/{sid}', auth=False, opener=player)
assert view['phase'] == 'completed' and not any('caption' in c for c in view['credits']), view
assert call(f'{API}/{slop["id"]}/publish', {})[1]['status'] == 'published'
items = listing(tags='db-riot')
assert items[real['id']]['stats'] == {'views': 1, 'correct': 1}, items[real['id']]['stats']
assert items[slop['id']]['stats'] == {'views': 1, 'correct': 0}, items[slop['id']]['stats']
assert items[slop['id']]['status'] == 'published' and items[slop['id']]['description'] == 'Descrizione modificata.'
# Start of an edit with no game in progress: out of publication, and its copy leaves the game bucket at once.
held = sql(f"SELECT copy_key FROM images WHERE id='{slop['id']}'")[0]['copy_key']
status, slop = call(f'{API}/{slop["id"]}/withdraw', {}); assert slop['status'] == 'approved' and slop['in_play'] == 0, slop
assert not stored(held)

# Regeneration must start a new reviewed editorial process; no paid bypass remains on the library row.
openai([])
old = sql(f"SELECT original_key,copy_key FROM images WHERE id='{slop['id']}'")[0]
status, result = call(f'{API}/{slop["id"]}/regenerate', {'confirm': True, 'prompt': 'A new scene', 'quality': 'medium', 'revision': slop['revision']})
assert status == 409 and 'nuovo processo' in result['error'], result
assert openai() == []
assert sql(f"SELECT original_key,copy_key FROM images WHERE id='{slop['id']}'")[0] == old

# The game is over: listing sweeps the retired copies no game needs.
call(API)
assert not stored(old['copy_key'])
# Clean up: our images to the trash and away.
for image_id in ours:
    call(f'{API}/{image_id}/withdraw', {}); call(f'{API}/{image_id}/trash', {})
status, result = call(f'{API}/bulk', {'action': 'delete', 'ids': sorted(ours)}); assert result == {'deleted': 3, 'postponed': 0}, result
print('Database integration 1.4.0 passed: no captions; tag filters, statistics, edit during a game, regeneration with reset statistics, distribution.')
