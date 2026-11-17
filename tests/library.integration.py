"""Library through the API on a local Worker with real D1 and R2: add, game copy and crop, ND licences refused, edit,
tags, approve, publish, play, withdraw, trash (also of a published photo), delete for good with every row and file, bulk actions."""
from local_db import sql
import http.cookiejar
import time
import hashlib
import secrets
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
from game_copy import centred_crop, crop_query, game_copy

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
def upload(source, origin='REAL', title='Fixture photo'):
    return call(f'{API}/upload?' + urllib.parse.urlencode({'origin': origin, 'title': title}), raw=source, mime='image/jpeg')
def copy(item_id, data, mime='image/webp', query=''):
    return call(f'{API}/{item_id}/copy' + query, raw=data, mime=mime)
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
# Game copy: nearest format (2:3 for the 40×64 photo), cut along a crop (centred by default); dimensions, format and size are checked.
assert copy(real['id'], game_copy(real_source, size=(40, 64)))[0] == 409
assert copy(real['id'], game_copy(real_source, fmt='PNG'), 'image/png')[0] == 415
assert copy(real['id'], b'x' * 4_000_001)[0] == 413
for wrong in ('?crop=1,0,40,60,2:3', '?crop=0,5,40,60,2:3', '?crop=0,0,20,30,2:3', '?crop=0,0,40,50,4:3', '?crop=0,2,40,60',
              '?crop=a'):  # outside, too small, 4:5, old form
    assert copy(real['id'], game_copy(real_source), query=wrong)[0] == 400, wrong
status, real, _ = copy(real['id'], game_copy(real_source))
assert status == 201 and (real['copy']['width'], real['copy']['height']) == (40, 50) and real['copy']['crop'] == centred_crop(40, 64), real
assert real['copy']['crop']['format'] == '4:5' and 'view' not in real['copy'] and 'redo' not in real['copy'], real
assert not {"caption", "generated_caption", "copy_view", "explanation"} & {r["name"] for r in sql("PRAGMA table_info(images)")}
assert copy(real['id'], game_copy(real_source))[1]['already_prepared'] is True
# Another crop remakes the copy: new file, the previous one leaves the quarantine.
first_copy = sql(f"SELECT copy_key FROM images WHERE id='{real['id']}'")[0]['copy_key']
frame = {'x': 0, 'y': 14, 'width': 40, 'height': 50, 'format': '4:5'}  # the lowest crop instead of the centred one
status, real, _ = copy(real['id'], game_copy(real_source, frame), query=crop_query(frame, {'x': 0, 'y': 0, 'height': 5}))  # view ignored
assert status == 201 and real['copy']['crop'] == frame and 'view' not in real['copy'], real
assert not stored(QUARANTINE, first_copy)
frame = centred_crop(40, 64)
status, real, _ = copy(real['id'], game_copy(real_source, frame), query=crop_query(frame)); assert status == 201, real
# No view any more: the route is gone.
assert call(f'{API}/{real["id"]}/view', {'revision': real['revision'], 'view': {'x': 0, 'y': 10, 'height': 50}})[0] == 404
status, served, headers = call(base + real['file'])
assert status == 200 and served[:4] == b'RIFF' and b'Canon' not in served
# Edit in place: removed fields refused, ASCII tags, optimistic revision.
status, result, _ = patch(real, {'caption': 'Parigi, 1968.'}); assert status == 400 and 'Campi non previsti' in result['error'], result
status, result, _ = patch(real, {'tags': ['São Paulo']}); assert status == 400 and 'sao-paulo' in result['error'], result
status, real, _ = patch(real, {'title': 'Barricate in rue de Rivoli',
                              'description': 'Owner-written description.', 'tags': ['riot', 'paris', 'rue-de-rivoli']})
assert status == 200 and real['tags'] == ['paris', 'riot', 'rue-de-rivoli'] and 'caption' not in real, real
assert patch({**real, 'revision': real['revision'] - 1}, {'title': 'Stale'})[0] == 409
# A copy of an earlier recipe (4:5 frame without format, or no frame) and a licence without derivatives block the approval.
for old in ("'" + json.dumps({'x': 0, 'y': 7, 'height': 50}) + "'", 'NULL'):
    sql(f"UPDATE images SET copy_crop={old} WHERE id='{real['id']}'")
    status, result, _ = call(f'{API}/{real["id"]}/approve', {'rights_confirmed': True}); assert status == 409 and '4:5' in result['error'], result
sql(f"UPDATE images SET copy_crop='{json.dumps(centred_crop(40, 64))}',license_name='CC BY-ND 4.0' WHERE id='{real['id']}'")
status, result, _ = call(f'{API}/{real["id"]}/approve', {'rights_confirmed': True}); assert status == 409 and 'ND' in result['error'], result
status, view, _ = call(f'{API}/{real["id"]}'); assert view['no_derivatives'] is True
sql(f"UPDATE images SET license_name='' WHERE id='{real['id']}'")
status, real, _ = call(f'{API}/{real["id"]}')
# Approve: a REAL needs the rights confirmation; a later edit keeps it approved (owner decision of 2026-11-11).
status, result, _ = call(f'{API}/{real["id"]}/approve', {}); assert status == 409 and 'diritti' in result['error'], result
status, real, _ = call(f'{API}/{real["id"]}/approve', {'rights_confirmed': True}); assert real['status'] == 'approved', real
status, real, _ = patch(real, {'description': 'Fotografia scattata durante il maggio francese.'}); assert real['status'] == 'approved', real
status, result, _ = patch(real, {'tags': []}); assert status == 409 and 'almeno un tag' in result['error'], result
# A SLOP image: no rights checkbox, but copy and tags are required.
slop_source = photo((0, 0, 200), (48, 48), exif=False, fmt='PNG')
status, slop, _ = call(f'{API}/upload?' + urllib.parse.urlencode({'origin': 'SLOP', 'prompt': 'A street in 1968'}),
                       raw=slop_source, mime='image/png')
assert status == 201 and slop['prompt'] == 'A street in 1968', slop
assert sql("SELECT title FROM images WHERE id='"+slop['id']+"'")[0]['title'] is None
assert not {'title', 'source_url', 'author', 'license_name', 'license_url', 'commons_description', 'explanation'} & slop.keys(), slop
assert not {'prompt', 'model', 'explanation'} & real.keys(), real
for item, change in [(real, {'explanation': 'Unused'}), (real, {'prompt': 'Not a REAL field'}), (slop, {'author': 'Not a SLOP field'}), (slop, {'title': 'Not a SLOP field'})]:
    status, result, _ = patch(item, change)
    assert status == 400 and 'Campi non previsti' in result['error'], result
assert call(f'{API}/{slop["id"]}/approve', {})[0] == 409  # no copy
status, slop, _ = copy(slop['id'], game_copy(slop_source)); assert status == 201
assert call(f'{API}/{slop["id"]}/approve', {})[0] == 409  # no tag
status, slop, _ = patch(slop, {'tags': ['riot', 'street']})
status, slop, _ = call(f'{API}/{slop["id"]}/approve', {}); assert slop['status'] == 'approved', slop
# Publish: the approved copy goes to the game bucket; published images are read-only.
for item in (real, slop):
    status, published, _ = call(f'{API}/{item["id"]}/publish', {}); assert published['status'] == 'published', published
real_keys = sql(f"SELECT original_key,copy_key FROM images WHERE id='{real['id']}'")[0]
assert stored(IMAGES, real_keys['copy_key']) and stored(QUARANTINE, real_keys['original_key'])
assert call(f'{API}/{real["id"]}', {'revision': 99, 'title': 'x'}, method='PATCH')[0] == 409
# Play: a game in progress with these two photos, seeded in the local D1; the round shows only the photo, never the origin; the file
# has no metadata.
cookie = secrets.token_hex(16); sid = 'lib-game-' + secrets.token_hex(4)
sql(f"INSERT INTO game_sessions(id,mode,level,created_at,owner_hash,phase,timing_mode,round_seconds) VALUES('{sid}','levels','facile',"
    f"{int(time.time() * 1000)},'{hashlib.sha256(cookie.encode()).hexdigest()}','active','per-image',20); "
    f"INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) SELECT '{sid}-0','{sid}',id,0,copy_key FROM images WHERE id='{real['id']}'; "
    f"INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) SELECT '{sid}-1','{sid}',id,1,copy_key FROM images WHERE id='{slop['id']}'")
player = urllib.request.build_opener(); player.addheaders = [('Cookie', 'ros_owner=' + cookie)]
session = {'id': sid}
status, view, _ = call(base + '/api/sessions/' + sid, auth=False, opener=player)
question = view['question']
assert 'caption' not in question, question
assert not any(key in json.dumps(view) for key in ('origin', 'prompt', 'license', 'REAL"', '"AI"')), view
status, image, headers = call(base + question['image'], auth=False, opener=player)
assert status == 200 and headers['Content-Type'] == 'image/webp' and b'Canon' not in image and b'Mario Rossi' not in image
assert call(base + f'/api/sessions/{sid}/media/{sid}-1', auth=False, opener=player)[0] == 404  # not its turn yet
assert call(base + f'/api/sessions/{sid}/ready', {'roundId': question['id']}, auth=False, opener=player)[0] == 200
status, answer, _ = call(base + f'/api/sessions/{sid}/answer', {'roundId': question['id'], 'choice': 'REAL'}, auth=False, opener=player)
assert status == 200 and answer == {'correct': True, 'answer': 'REAL'}, answer
# Trash of a published photo: out of publication at once; the game in progress keeps its copy; restored, it is approved.
slop_copy = sql(f"SELECT copy_key FROM images WHERE id='{slop['id']}'")[0]['copy_key']
status, slop, _ = call(f'{API}/{slop["id"]}/trash', {})
assert status == 200 and slop['status'] == 'trash' and slop['trashed_from'] == 'approved' and slop['published_at'] is None, slop
assert stored(IMAGES, slop_copy)  # still needed by the game in progress
status, slop, _ = call(f'{API}/{slop["id"]}/restore', {}); assert slop['status'] == 'approved', slop
# Withdraw while the game is in progress: the copy stays in the game bucket, the game keeps its copy.
status, real, _ = call(f'{API}/{real["id"]}/withdraw', {}); assert real['status'] == 'approved'
in_game = sql(f"SELECT count(*) AS n FROM game_rounds r JOIN game_sessions s ON s.id=r.session_id WHERE s.id='{session['id']}' AND r.image_id='{real['id']}' AND s.phase='active'")[0]['n']
assert stored(IMAGES, real_keys['copy_key']) == bool(in_game)
status, real, _ = patch(real, {'description': 'Descrizione nuova, dopo la partita.'}); assert real['status'] == 'approved', real
status, view, _ = call(base + '/api/sessions/' + session['id'], auth=False, opener=player)
if view['question']: assert 'caption' not in view['question'], view
if in_game:
    assert real['in_play'] == 1, real
    status, real, _ = call(f'{API}/{real["id"]}/trash', {})
    status, result, _ = call(f'{API}/{real["id"]}', method='DELETE'); assert status == 409 and 'partite' in result['error'] and 'in corso' in result['error'], result
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
print('Library integration 1.9.0 passed: no captions; no initial view; trash withdraws a published photo; level game seeded; copies with 4:5 crop, ND refused; add, copy, edit kept approved, publish, play without captions, withdraw with the game in progress, trash, delete with every row and file, upload again, bulk.')
