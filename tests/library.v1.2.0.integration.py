"""v1.2.0, 2026-11-11T09:30:00Z: database section (docs/database-immagini.v1.0.0.md): an edit keeps an approved image approved;
withdrawing keeps the game copy while a game in progress uses it, the game goes on with the caption it started with, deleting
for good waits for that game; once it ends the copy and the rows go.
v1.1.0, 2026-11-10T06:23:49Z: caption ceiling 256 (docs/libreria-immagini.v1.5.0.md, section 4; migration 0036).
v1.0.0, 2026-11-09T16:30:00Z: image library on the clean schema (docs/libreria-immagini.v1.1.0.md), against a
LOCAL Worker with real D1 and R2: add, game copy, edit, tags, approve, publish, play, withdraw, trash, delete for good
(every row and file), upload again, bulk actions."""
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
from PIL import Image, ImageOps

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
state = os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
API = base + '/api/admin/library'

def call(url, data=None, method=None, raw=None, mime='application/json', auth=True, opener=None):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    headers = {'Content-Type': mime, **({'Authorization': 'Bearer ' + token} if auth else {})}
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body is not None else 'GET'), headers=headers)
    try:
        with (opener or urllib.request.build_opener()).open(req) as r:
            payload = r.read()
            return r.status, (json.loads(payload) if r.headers.get('Content-Type', '').startswith('application/json') else payload), r.headers
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}'), e.headers
def sql(command):
    out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command, '--json'],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]['results']
def stored(bucket, key):
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / 'f'
        subprocess.run(['npx', 'wrangler', 'r2', 'object', 'get', f'{bucket}/{key}', '--file', str(target), '--local', '--env', 'local',
                        '--persist-to', state], capture_output=True)
        return target.exists() and target.stat().st_size > 0
QUARANTINE, IMAGES = 'real-or-slop-quarantine-local', 'real-or-slop-approved-local'

def photo(color, size=(64, 40), exif=True, fmt='JPEG'):
    image = Image.new('RGB', size); image.putdata([(color[0], (x * 3) % 256, (y * 5) % 256) for y in range(size[1]) for x in range(size[0])])
    out = io.BytesIO()
    if exif:
        meta = Image.Exif(); meta[0x010f] = 'Canon'; meta[0x013b] = 'Mario Rossi'; meta[0x0112] = 6
        image.save(out, fmt, quality=95, exif=meta)
    else: image.save(out, fmt)
    return out.getvalue()
def game_copy(source, size=None, fmt='WEBP'):
    """Stand-in for the browser encoder (src/game-copy.v1.0.0.ts): orientation applied, same recipe."""
    picture = ImageOps.exif_transpose(Image.open(io.BytesIO(source))).convert('RGB')
    if size: picture = picture.resize(size)
    out = io.BytesIO(); picture.save(out, fmt, quality=85); return out.getvalue()
def upload(source, origin='REAL', title='Fixture photo'):
    return call(f'{API}/upload?' + urllib.parse.urlencode({'origin': origin, 'title': title}), raw=source, mime='image/jpeg')
def copy(item_id, data, mime='image/webp'):
    return call(f'{API}/{item_id}/copy', raw=data, mime=mime)
def patch(item, change):
    return call(f'{API}/{item["id"]}', {'revision': item['revision'], **change}, method='PATCH')

# Access
assert call(API, auth=False)[0] == 401
# Add a REAL photo: original kept as it is, game copy still missing.
real_source = photo((200, 0, 0))
status, real, _ = upload(real_source, title='Rue de Rivoli, 1968')
assert status == 201 and real['status'] == 'new' and real['copy'] is None and real['origin'] == 'REAL', real
assert (real['width'], real['height']) == (40, 64)  # EXIF orientation 6: displayed portrait
assert upload(real_source)[0] == 409  # the same file twice
assert upload(b'not an image')[0] == 415
# Game copy: dimensions, format and size are checked against the original.
assert copy(real['id'], game_copy(real_source, (64, 40)))[0] == 409
assert copy(real['id'], game_copy(real_source, fmt='PNG'), 'image/png')[0] == 415
assert copy(real['id'], b'x' * 4_000_001)[0] == 413
status, real, _ = copy(real['id'], game_copy(real_source))
assert status == 201 and real['copy']['width'] == 40 and real['copy']['height'] == 64, real
assert copy(real['id'], game_copy(real_source))[1]['already_prepared'] is True
status, served, headers = call(base + real['file'])
assert status == 200 and served[:4] == b'RIFF' and b'Canon' not in served
# Edit in place: fields, caption length, ASCII tags, optimistic revision.
status, result, _ = patch(real, {'caption': 'x' * 257}); assert status == 400 and '256' in result['error'], result
status, result, _ = patch(real, {'tags': ['São Paulo']}); assert status == 400 and 'sao-paulo' in result['error'], result
status, real, _ = patch(real, {'title': 'Barricate in rue de Rivoli', 'caption': 'Parigi, maggio 1968. Barricate in rue de Rivoli.',
                              'description': 'Owner-written description.', 'tags': ['riot', 'paris', 'rue-de-rivoli']})
assert status == 200 and real['tags'] == ['paris', 'riot', 'rue-de-rivoli'] and real['caption'].startswith('Parigi'), real
assert patch({**real, 'revision': real['revision'] - 1}, {'title': 'Stale'})[0] == 409
# Approve: a REAL needs the rights confirmation; a later edit keeps it approved (owner decision of 2026-11-11).
status, result, _ = call(f'{API}/{real["id"]}/approve', {}); assert status == 409 and 'diritti' in result['error'], result
status, real, _ = call(f'{API}/{real["id"]}/approve', {'rights_confirmed': True}); assert real['status'] == 'approved', real
status, real, _ = patch(real, {'explanation': 'Fotografia scattata durante il maggio francese.'}); assert real['status'] == 'approved', real
status, result, _ = patch(real, {'tags': []}); assert status == 409 and 'almeno un tag' in result['error'], result
# A SLOP image: no rights checkbox, but copy and tags are required.
slop_source = photo((0, 0, 200), (48, 48), exif=False, fmt='PNG')
status, slop, _ = call(f'{API}/upload?' + urllib.parse.urlencode({'origin': 'SLOP', 'title': 'Generated street scene', 'prompt': 'A street in 1968'}),
                       raw=slop_source, mime='image/png')
assert status == 201 and slop['prompt'] == 'A street in 1968', slop
assert call(f'{API}/{slop["id"]}/approve', {})[0] == 409  # no copy
status, slop, _ = copy(slop['id'], game_copy(slop_source)); assert status == 201
assert call(f'{API}/{slop["id"]}/approve', {})[0] == 409  # no tag
status, slop, _ = patch(slop, {'tags': ['riot', 'street'], 'caption': 'Parigi, 1968. Una strada bloccata.'})
status, slop, _ = call(f'{API}/{slop["id"]}/approve', {}); assert slop['status'] == 'approved', slop
# Publish: the approved copy goes to the game bucket; published images are read-only.
for item in (real, slop):
    status, published, _ = call(f'{API}/{item["id"]}/publish', {}); assert published['status'] == 'published', published
real_keys = sql(f"SELECT original_key,copy_key FROM images WHERE id='{real['id']}'")[0]
assert stored(IMAGES, real_keys['copy_key']) and stored(QUARANTINE, real_keys['original_key'])
assert call(f'{API}/{real["id"]}', {'revision': 99, 'title': 'x'}, method='PATCH')[0] == 409
assert call(f'{API}/{real["id"]}/trash', {})[0] == 409  # withdraw first
# Play: the round shows image and caption, never the origin; the file has no metadata.
player = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
status, session, _ = call(base + '/api/sessions', {'mode': 'training', 'count': 2}, auth=False, opener=player)
assert status == 201, session
status, view, _ = call(base + '/api/sessions/' + session['id'], auth=False, opener=player)
question = view['question']
assert question['caption'] in ('Parigi, maggio 1968. Barricate in rue de Rivoli.', 'Parigi, 1968. Una strada bloccata.'), question
assert not any(key in json.dumps(view) for key in ('origin', 'prompt', 'license', 'REAL"', '"AI"')), view
status, image, headers = call(base + question['image'], auth=False, opener=player)
assert status == 200 and headers['Content-Type'] == 'image/webp' and b'Canon' not in image and b'Mario Rossi' not in image
assert call(base + '/api/sessions/' + session['id'] + '/ready', {'roundId': question['id']}, auth=False, opener=player)[0] == 200
status, answer, _ = call(base + '/api/sessions/' + session['id'] + '/answer', {'roundId': question['id'], 'choice': 'REAL'}, auth=False, opener=player)
assert status == 200 and answer['answer'] in ('REAL', 'AI') and answer['title'], answer
assert 1 <= sql(f"SELECT count(*) AS n FROM game_rounds WHERE session_id='{session['id']}'")[0]['n'] == view['total'] <= 2
# Withdraw while the game is in progress: the copy stays in the game bucket, the game keeps its caption.
status, real, _ = call(f'{API}/{real["id"]}/withdraw', {}); assert real['status'] == 'approved'
in_game = sql(f"SELECT count(*) AS n FROM game_rounds r JOIN game_sessions s ON s.id=r.session_id WHERE s.id='{session['id']}' AND r.image_id='{real['id']}' AND s.phase='active'")[0]['n']
assert stored(IMAGES, real_keys['copy_key']) == bool(in_game)
status, real, _ = patch(real, {'caption': 'Didascalia nuova, dopo la partita.'}); assert real['status'] == 'approved', real
status, view, _ = call(base + '/api/sessions/' + session['id'], auth=False, opener=player)
if view['question']: assert view['question']['caption'] != 'Didascalia nuova, dopo la partita.', view
if in_game:
    assert real['in_play'] == 1, real
    status, real, _ = call(f'{API}/{real["id"]}/trash', {})
    status, result, _ = call(f'{API}/{real["id"]}', method='DELETE'); assert status == 409 and 'partite in corso' in result['error'], result
    status, real, _ = call(f'{API}/{real["id"]}/restore', {})
# The game ends: nothing holds the copy any more.
sql(f"UPDATE game_sessions SET phase='completed',completed=1 WHERE id='{session['id']}'")
call(API)  # every listing sweeps the retired copies
assert not stored(IMAGES, real_keys['copy_key'])
assert sql(f"SELECT count(*) AS n FROM retired_copies WHERE image_id='{real['id']}'")[0]['n'] == 0
# Trash, restore, trash again, delete for good: every row and every file goes.
status, real, _ = call(f'{API}/{real["id"]}/trash', {}); assert real['status'] == 'trash'
status, real, _ = call(f'{API}/{real["id"]}/restore', {}); assert real['status'] == 'approved'
status, real, _ = call(f'{API}/{real["id"]}/trash', {})
assert call(f'{API}/{slop["id"]}', method='DELETE')[0] == 409  # only from the trash
status, result, _ = call(f'{API}/{real["id"]}', method='DELETE'); assert status == 200 and result['deleted'] == 1, result
for table, column in (('images', 'id'), ('image_tags', 'image_id'), ('game_rounds', 'image_id')):
    assert sql(f"SELECT count(*) AS n FROM {table} WHERE {column}='{real['id']}'")[0]['n'] == 0, table
assert not stored(QUARANTINE, real_keys['original_key']) and not stored(QUARANTINE, real_keys['copy_key'])
# The deleted photo can be uploaded again, e.g. after a mistake.
status, again, _ = upload(real_source, title='Ricaricata'); assert status == 201 and again['id'] != real['id'], again
# Bulk: add tags, trash, empty the trash.
status, result, _ = call(f'{API}/bulk', {'action': 'tag-add', 'ids': [again['id']], 'tags': ['barricade']}); assert result['done'] == 1, result
status, result, _ = call(f'{API}/bulk', {'action': 'trash', 'ids': [again['id']]}); assert result['done'] == 1, result
status, listing, _ = call(f'{API}?status=trash'); assert [i['id'] for i in listing['items']] == [again['id']], listing
status, result, _ = call(f'{API}/trash/empty', {}); assert result['deleted'] == 1 and result['postponed'] == 0, result
status, tags, _ = call(f'{API}/tags')
assert {t['label']: t['images'] for t in tags['tags']}.get('riot') == 1, tags  # the SLOP keeps its tags
assert call(f'{API}/commons', {'url': 'https://example.com/not-commons.jpg'})[0] in (400, 404)
print('Library integration 1.2.0 passed: add, copy, edit kept approved, publish, play with caption, withdraw with the game in progress, trash, delete with every row and file, upload again, bulk.')
