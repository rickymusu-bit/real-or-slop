"""v1.3.0, 2026-11-13T10:00:00Z: copies in the nearest common format (tests/game_copy_v3_0_0.py); a regenerated SLOP is asked
in the format of its copy (3:2 here).
v1.2.0, 2026-11-12T09:00:00Z: games are level games seeded in the local D1 (a level needs 10 REAL and 10 SLOP); no PvP.
v1.1.0, 2026-11-12T08:00:00Z: game copies in 4:5 (tests/game_copy_v2_0_0.py).
v1.0.0, 2026-11-11T09:30:00Z: Database section (docs/database-immagini.v1.0.0.md) against a LOCAL Worker with real D1 and R2 and the
fake OpenAI (tests/fake_openai.v1.3.0.py): filter by several tags (all or any) and by origin; views and correct classifications
from single-player games and PvP answers; an edit of a published photo starts by taking it out of publication, games in
progress keep caption and copy, the photo stays approved; regeneration of a SLOP (refused for REAL, published or unconfirmed,
paid and recorded, image replaced, statistics reset, analysis allowed again); distribution with approved and published and
the spread. Nothing reaches OpenAI."""
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
from game_copy_v3_0_0 import game_copy

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
def sql(command):
    out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command, '--json'],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]['results']
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
def add(origin, title, seed, tags, caption, prompt=''):
    source = picture(seed)
    status, item = call(f'{API}/upload?' + urllib.parse.urlencode({'origin': origin, 'title': title, 'prompt': prompt}), raw=source, mime='image/png')
    assert status == 201, item
    status, item = call(f'{API}/{item["id"]}/copy', raw=webp(source), mime='image/webp'); assert status == 201, item
    status, item = call(f'{API}/{item["id"]}', {'revision': item['revision'], 'tags': tags, 'caption': caption,
                                                'tag_categories': {t: 'event' if t == 'db-riot' else 'place' if t == 'db-paris' else 'setting' for t in tags}}, method='PATCH')
    assert status == 200, item
    status, item = call(f'{API}/{item["id"]}/approve', {'rights_confirmed': True}); assert item['status'] == 'approved', item
    return item
def listing(**params):
    status, data = call(API + '?' + urllib.parse.urlencode(params)); assert status == 200, data
    return {i['id']: i for i in data['items']}

# Published images from earlier scripts would join the games: take them out first, so the game below uses only ours.
for row in sql("SELECT id FROM images WHERE status='published'"): call(f'{API}/{row["id"]}/withdraw', {})
real = add('REAL', 'Barricate', 3, ['db-riot', 'db-paris'], 'Parigi, 1968. Barricate.')
slop = add('SLOP', 'Scontri', 5, ['db-riot'], 'Milano, 1969. Scontri in piazza.', prompt='A riot in a square, 1969')
beach = add('SLOP', 'Spiaggia', 7, ['db-beach'], 'Rimini, 1975. Spiaggia affollata.', prompt='A crowded beach, 1975')
ours = {real['id'], slop['id'], beach['id']}
for item in (real, slop): assert call(f'{API}/{item["id"]}/publish', {})[1]['status'] == 'published'

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
# the owner starts editing it; the game keeps caption and copy; the SLOP is classified wrong.
import hashlib, secrets, time
cookie = secrets.token_hex(16); sid = 'db-game-' + secrets.token_hex(4)
player = urllib.request.build_opener(); player.addheaders = [('Cookie', 'ros_owner=' + cookie)]
sql(f"INSERT INTO game_sessions(id,mode,level,created_at,owner_hash,phase,timing_mode,round_seconds) VALUES('{sid}','levels','facile',"
    f"{int(time.time() * 1000)},'{hashlib.sha256(cookie.encode()).hexdigest()}','active','per-image',20); "
    f"INSERT INTO game_rounds(id,session_id,image_id,position,caption,copy_key) SELECT '{sid}-0','{sid}',id,0,caption,copy_key FROM images WHERE id='{real['id']}'; "
    f"INSERT INTO game_rounds(id,session_id,image_id,position,caption,copy_key) SELECT '{sid}-1','{sid}',id,1,caption,copy_key FROM images WHERE id='{slop['id']}'")
for position, image_id in enumerate((real['id'], slop['id'])):
    status, view = call(f'{base}/api/sessions/{sid}', auth=False, opener=player)
    question = view['question']; assert question['id'] == f'{sid}-{position}', view
    assert call(f'{base}/api/sessions/{sid}/ready', {'roundId': question['id']}, auth=False, opener=player)[0] == 200
    if image_id == slop['id']:
        # Edit during the game: the photo leaves publication at once; the game keeps caption and copy.
        status, edited = call(f'{API}/{slop["id"]}/withdraw', {}); assert edited['status'] == 'approved' and edited['in_play'] == 1, edited
        held = sql(f"SELECT copy_key FROM images WHERE id='{slop['id']}'")[0]['copy_key']
        assert stored(held) and sql(f"SELECT count(*) AS n FROM retired_copies WHERE copy_key='{held}'")[0]['n'] == 1
        status, edited = call(f'{API}/{slop["id"]}', {'revision': edited['revision'], 'caption': 'Didascalia modificata.'}, method='PATCH')
        assert status == 200 and edited['status'] == 'approved', edited
        status, again = call(f'{base}/api/sessions/{sid}', auth=False, opener=player)
        assert again['question']['caption'] == 'Milano, 1969. Scontri in piazza.', again['question']
        status, media = call(base + again['question']['image'], auth=False, opener=player); assert status == 200 and media[:4] == b'RIFF'
    status, answer = call(f'{base}/api/sessions/{sid}/answer', {'roundId': question['id'], 'choice': 'REAL'}, auth=False, opener=player)
    assert status == 200 and answer['correct'] == (image_id == real['id']), answer
status, view = call(f'{base}/api/sessions/{sid}', auth=False, opener=player)
assert view['phase'] == 'completed' and [c['caption'] for c in view['credits']][1] == 'Milano, 1969. Scontri in piazza.', view
assert call(f'{API}/{slop["id"]}/publish', {})[1]['status'] == 'published'
items = listing(tags='db-riot')
assert items[real['id']]['stats'] == {'views': 1, 'correct': 1}, items[real['id']]['stats']
assert items[slop['id']]['stats'] == {'views': 1, 'correct': 0}, items[slop['id']]['stats']
assert items[slop['id']]['status'] == 'published' and items[slop['id']]['caption'] == 'Didascalia modificata.'
# Start of an edit with no game in progress: out of publication, and its copy leaves the game bucket at once.
held = sql(f"SELECT copy_key FROM images WHERE id='{slop['id']}'")[0]['copy_key']
status, slop = call(f'{API}/{slop["id"]}/withdraw', {}); assert slop['status'] == 'approved' and slop['in_play'] == 0, slop
assert not stored(held)

# Regeneration: only a SLOP, not published, confirmed, with an allowed quality and the current revision.
openai([])
assert call(f'{API}/{real["id"]}/regenerate', {'confirm': True, 'prompt': 'x', 'quality': 'medium', 'revision': real['revision']})[0] == 409
assert call(f'{API}/{slop["id"]}/regenerate', {'prompt': 'x', 'quality': 'medium', 'revision': slop['revision']})[0] == 400
assert call(f'{API}/{slop["id"]}/regenerate', {'confirm': True, 'prompt': 'x', 'quality': 'ultra', 'revision': slop['revision']})[0] == 400
assert call(f'{API}/{slop["id"]}/regenerate', {'confirm': True, 'prompt': 'x', 'quality': 'medium', 'revision': slop['revision'] - 1})[0] == 409
assert not openai(), 'no call before the checks pass'
old = sql(f"SELECT original_key,copy_key FROM images WHERE id='{slop['id']}'")[0]
calls_before = sql("SELECT count(*) AS n FROM paid_calls WHERE kind='images'")[0]['n']
status, regenerated = call(f'{API}/{slop["id"]}/regenerate', {'confirm': True, 'prompt': 'A riot in a square at dusk, 1969', 'quality': 'medium',
                                                             'revision': slop['revision']})
assert status == 200, regenerated
log = openai(); assert len(log) == 1 and log[0]['path'] == '/v1/images/generations', log
assert set(log[0]['body']) == {'model', 'prompt', 'n', 'size', 'quality'} and log[0]['body']['prompt'] == 'A riot in a square at dusk, 1969'
assert log[0]['body']['size'] == '1536x1024'  # 3:2, the format of its game copy
assert regenerated['status'] == 'new' and regenerated['copy'] is None and regenerated['analysis']['status'] == 'none', regenerated
assert regenerated['prompt'] == 'A riot in a square at dusk, 1969' and regenerated['stats'] == {'views': 0, 'correct': 0}, regenerated
assert regenerated['tags'] == ['db-riot'] and regenerated['generated'] is None, regenerated
assert sql("SELECT count(*) AS n FROM paid_calls WHERE kind='images'")[0]['n'] == calls_before + 1
new = sql(f"SELECT original_key FROM images WHERE id='{slop['id']}'")[0]
assert new['original_key'] != old['original_key']
# New copy, a new analysis allowed once, approval.
status, original = call(f'{API}/{slop["id"]}/original'); assert status == 200
status, slop = call(f'{API}/{slop["id"]}/copy', raw=webp(original), mime='image/webp'); assert status == 201, slop
openai([{'tags': ['db-riot', 'db-dusk'], 'caption': 'Milano, 1969. Scontri al tramonto.'}])
status, slop = call(f'{API}/{slop["id"]}/analyze', {'confirm': True}); assert status == 200 and slop['analysis']['status'] == 'done', slop
assert 'db-dusk' in slop['tags'] and slop['caption'] == 'Milano, 1969. Scontri al tramonto.', slop
assert call(f'{API}/{slop["id"]}/analyze', {'confirm': True})[0] == 409  # once per image
status, slop = call(f'{API}/{slop["id"]}/approve', {}); assert slop['status'] == 'approved', slop
# A published SLOP must leave the game first.
assert call(f'{API}/{slop["id"]}/publish', {})[1]['status'] == 'published'
status, result = call(f'{API}/{slop["id"]}/regenerate', {'confirm': True, 'prompt': 'x', 'quality': 'medium', 'revision': slop['revision'] + 1})
assert status == 409 and 'pubblicata' in result['error'], result

# The game is over: listing sweeps the retired copies no game needs.
call(API)
assert not stored(old['copy_key'])
# Clean up: our images to the trash and away.
for image_id in ours:
    call(f'{API}/{image_id}/withdraw', {}); call(f'{API}/{image_id}/trash', {})
status, result = call(f'{API}/bulk', {'action': 'delete', 'ids': sorted(ours)}); assert result == {'deleted': 3, 'postponed': 0}, result
print('Database integration passed: tag filters, statistics, edit during a game, regeneration with reset statistics, distribution.')
