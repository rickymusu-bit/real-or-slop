"""v1.0.0, 2026-11-09T13:00:00Z: R2 space (docs/spazio-file.v1.0.0.md). Deleting rejected photos definitively also
deletes their owner-first files (original and game copy); a photo still in the queue keeps its files."""
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import game_copy_helper

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
state = os.environ['ROS_TEST_STATE']

def call(path, data=None, method=None, raw=None, mime='application/json'):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(base+path, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Authorization': 'Bearer '+token, 'Content-Type': mime})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
def stored(key):
    with tempfile.TemporaryDirectory() as folder:
        out = subprocess.run(['npx', 'wrangler', 'r2', 'object', 'get', 'real-or-slop-quarantine-local/'+key, '--file', str(Path(folder)/'f'),
                              '--local', '--persist-to', state, '--env', 'local'], capture_output=True, text=True)
        return out.returncode == 0 and (Path(folder)/'f').exists() and (Path(folder)/'f').stat().st_size > 0
def sql(command):
    out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command, '--json'],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]['results']

code, topic = call('/api/admin/editorial/workspace/topics', {'title': 'Spazio file fixture '+uuid.uuid4().hex[:8], 'description': 'Owner-written description for the R2 space fixture.', 'operation_id': str(uuid.uuid4())})
assert code == 201, (code, topic)
photos = []
for n in range(3):
    buffer = io.BytesIO(); Image.new('RGB', (60+n, 40), (20*n, 90, 160)).save(buffer, 'PNG'); source = buffer.getvalue()
    code, saved = call('/api/admin/editorial/workspace/uploads?'+urllib.parse.urlencode({'topic_id': topic['id'], 'title': f'space-{n}.png'}),
                       raw=source, mime='image/png')
    assert code == 201, (code, saved)
    copy_sha = game_copy_helper.prepare(base, token, saved['inbox_id'], saved['sha256'], source)
    keys = sql(f"SELECT i.media_key AS original,g.media_key AS copy FROM editorial_review_inbox i JOIN editorial_review_game_copies g ON g.inbox_id=i.id WHERE i.id='{saved['inbox_id']}'")[0]
    assert keys['original'].startswith('owner-proposals/') and keys['copy'].startswith('game-copies/'), keys
    assert stored(keys['original']) and stored(keys['copy'])
    photos.append(dict(id=saved['inbox_id'], sha=copy_sha, source=source, **keys))

# Photos 0 and 1 are also linked to a Commons acquisition, as photos acquired from Commons are in production:
# its foreign key must not block the definitive deletion (regression of 2026-11-09).
for n in (0, 1):
    status, link = call('/api/admin/editorial/workspace/links', {'topic_id': topic['id'],
        'source_url': f'https://commons.wikimedia.org/wiki/File:Spazio_{uuid.uuid4().hex}.jpg'})
    assert status == 201, (status, link)
    sql(f"INSERT INTO editorial_workspace_acquisitions(proposal_id,inbox_id,source_json,created_at) VALUES('{link['id']}','{photos[n]['id']}','{{}}','d')")
    photos[n]['link'] = link['id']
def acquired(photo): return sql(f"SELECT count(*) AS n FROM editorial_workspace_acquisitions WHERE inbox_id='{photo['id']}'")[0]['n']
def proposals(photo):
    """Proposals still visible for this photo: its upload proposal and, for 0 and 1, the Commons link."""
    return sql(f"SELECT count(*) AS n FROM editorial_workspace_proposals WHERE inbox_id='{photo['id']}'"
               + (f" OR id='{photo['link']}'" if photo.get('link') else ''))[0]['n']
def archived(photo): return sql(f"SELECT count(*) AS n FROM editorial_deleted_photo_proposals WHERE inbox_id='{photo['id']}'")[0]['n']
assert proposals(photos[0]) == 2 and proposals(photos[1]) == 2 and proposals(photos[2]) == 1
assert acquired(photos[0]) == 1 and acquired(photos[1]) == 1

def reject(photo):
    status, result = call('/api/admin/review-inbox/'+photo['id']+'/decision',
                          {'decision': 'rejected', 'revision': 0, 'sha256': photo['sha'], 'note': 'space test', 'reason': 'editorial'})
    assert status == 200, (status, result)

# Single definitive deletion: both files go.
reject(photos[0])
status, result = call('/api/admin/review-inbox/'+photos[0]['id'], {'confirm_delete': True, 'revision': 1, 'sha256': photos[0]['sha']}, method='DELETE')
assert status == 200 and result['files_deleted'] == 2, (status, result)
assert not stored(photos[0]['original']) and not stored(photos[0]['copy'])
assert acquired(photos[0]) == 0
assert proposals(photos[0]) == 0 and archived(photos[0]) == 2  # upload proposal and Commons link: gone, snapshot kept
# The owner may upload the deleted photo again, e.g. into the right lot (docs/spazio-file.v1.2.0.md).
code, other = call('/api/admin/editorial/workspace/topics', {'title': 'Lotto giusto fixture '+uuid.uuid4().hex[:8],
    'description': 'Owner-written description for the right lot.', 'operation_id': str(uuid.uuid4())})
assert code == 201, (code, other)
code, again = call('/api/admin/editorial/workspace/uploads?'+urllib.parse.urlencode({'topic_id': other['id'], 'title': 'space-0-again.png'}),
                   raw=photos[0]['source'], mime='image/png')
assert code == 201 and again['inbox_id'] != photos[0]['id'], (code, again)
assert sql(f"SELECT status FROM editorial_review_inbox WHERE id='{again['inbox_id']}'")[0]['status'] == 'pending'
# ...but not twice: a photo still in the queue is a duplicate.
code, duplicate = call('/api/admin/editorial/workspace/uploads?'+urllib.parse.urlencode({'topic_id': topic['id'], 'title': 'dup.png'}),
                       raw=photos[0]['source'], mime='image/png')
assert code == 409 and 'già presente' in duplicate['error'], (code, duplicate)
# A photo still in the queue keeps its files.
assert stored(photos[2]['original']) and stored(photos[2]['copy'])
# Bulk deletion of the rejected: only the rejected photo's files go.
reject(photos[1])
status, snapshot = call('/api/admin/review-inbox/delete-rejected?origin=REAL')
assert status == 200 and snapshot['count'] >= 1, snapshot
status, result = call('/api/admin/review-inbox/delete-rejected', {'origin': 'REAL', 'snapshot_token': snapshot['snapshot_token'], 'confirm_delete': True}, method='DELETE')
assert status == 200 and result['files_deleted'] >= 2, (status, result)
assert not stored(photos[1]['original']) and not stored(photos[1]['copy'])
assert acquired(photos[1]) == 0
assert proposals(photos[1]) == 0 and archived(photos[1]) == 2
assert proposals(photos[2]) == 1 and archived(photos[2]) == 0
assert stored(photos[2]['original']) and stored(photos[2]['copy'])
print('R2 space passed: definitive deletions (single and bulk) remove owner-first originals, game copies, Commons acquisition links and the proposals of the photos (snapshot kept); deleted photos can be uploaded again; photos in the queue keep theirs.')
