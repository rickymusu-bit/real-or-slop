"""v1.0.0, 2026-11-09T10:00:00Z: game files without identifying metadata (docs/lotti-editoriali.v1.6.2.md, 6.4).
A camera-like JPEG with EXIF, ICC, comment and trailing data is stored in local R2; the game route must serve
the same pixels and orientation without any of that metadata, while the R2 original stays byte-identical."""
import hashlib, http.cookiejar, io, json, os, subprocess, tempfile, time, urllib.error, urllib.request, uuid
from pathlib import Path
from PIL import Image, ImageCms

base = os.environ.get('ROS_TEST_BASE', 'http://127.0.0.1:8787')
state = os.environ.get('ROS_TEST_STATE', '.wrangler/integration')
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
prefix = 'gamemedia_' + uuid.uuid4().hex[:12]

def wrangler(*args, **kwargs):
    result = subprocess.run(['npx', 'wrangler', *args, '--local', '--persist-to', state, '--env', 'local'], capture_output=True, text=True, **kwargs)
    if result.returncode: raise RuntimeError(' '.join(args[:3]) + ' failed: ' + (result.stdout + result.stderr)[-1500:])
    return result
def sql(command):
    # Generated test data only.
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as file:
        file.write(command); path = file.name
    try: return json.loads(wrangler('d1', 'execute', 'DB', '--file', path, '--json').stdout)
    finally: Path(path).unlink()
def request(path, method='GET', data=None):
    req = urllib.request.Request(base+path, method=method, headers={'Content-Type': 'application/json'},
                                 data=json.dumps(data).encode() if data is not None else None)
    try:
        with client.open(req) as response: return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error: return error.code, json.loads(error.read())

def camera_jpeg():
    image = Image.new('RGB', (48, 32))
    image.putdata([(x * 5, y * 7, (x + y) * 3) for y in range(32) for x in range(48)])
    exif = Image.Exif(); exif[0x010f] = 'Canon'; exif[0x0110] = 'EOS-5D'; exif[0x013b] = 'Mario Rossi'; exif[0x0112] = 6
    out = io.BytesIO()
    image.save(out, 'JPEG', quality=95, exif=exif, icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes(), comment=b'secret-comment')
    return out.getvalue() + b'trailing EOS-5D motion photo'
SECRETS = [b'Canon', b'EOS-5D', b'Mario Rossi', b'ICC_PROFILE', b'secret-comment', b'motion photo']

original = camera_jpeg()
assert all(secret in original for secret in SECRETS)
keys = {kind: f'{prefix}/{kind}.jpg' for kind in ('REAL', 'AI')}
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / 'camera.jpg'; path.write_bytes(original)
    for key in keys.values():
        wrangler('r2', 'object', 'put', 'real-or-slop-approved-local/'+key, '--file', str(path), '--content-type', 'image/jpeg')

# A game owner cookie, then a legacy session whose rounds point at the fixtures (as in sampling.integration.py).
status, _ = request('/api/sessions', 'POST', dict(mode='training', count=2))
assert status == 201
owner = hashlib.sha256(next(c.value for c in jar if c.name == 'ros_owner').encode()).hexdigest()
session = str(uuid.uuid4())
rows = [f"INSERT INTO images(id,type,title,description,author,authenticity_evidence,r2_key,ai_model,ai_prompt,status,sha256,perceptual_hash,explanation,demo) VALUES('{prefix}_{kind}','{kind}','GAME_MEDIA','fixture','fixture','fixture','{key}','fixture','fixture','approved','{hashlib.sha256(original + kind.encode()).hexdigest()}','0f0f0f0f0f0f0f0f','Fixture reveal',0)"
        for kind, key in keys.items()]
rows.append(f"INSERT INTO game_sessions(id,mode,created_at,owner_hash) VALUES('{session}','training',{int(time.time()*1000)},'{owner}')")
rows += [f"INSERT INTO game_rounds(id,session_id,image_id,position) VALUES('{uuid.uuid4()}','{session}','{prefix}_{kind}',{n})" for n, kind in enumerate(keys)]
sql(';\n'.join(rows) + ';')
try:
    status, view = request('/api/sessions/'+session)
    assert status == 200, view
    with client.open(base+view['question']['image']) as response:
        assert response.status == 200 and response.headers['Content-Type'] == 'image/jpeg'
        served = response.read()
    leaked = [secret.decode() for secret in SECRETS if secret in served]
    assert not leaked, leaked
    assert len(served) < len(original)
    clean, reference = Image.open(io.BytesIO(served)), Image.open(io.BytesIO(original))
    assert clean.getexif().get(0x0112) == 6 and len(clean.getexif()) == 1, dict(clean.getexif())
    assert 'icc_profile' not in clean.info and 'comment' not in clean.info
    assert clean.tobytes() == reference.tobytes(), 'pixels must be identical'
    # Once a uniform game copy exists for the admitted file, the game serves it instead (docs/copie-di-gioco.v1.0.0.md).
    webp = io.BytesIO(); reference.transpose(Image.Transpose.ROTATE_270).save(webp, 'WEBP', quality=85); webp = webp.getvalue()
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'copy.webp'; path.write_bytes(webp)
        wrangler('r2', 'object', 'put', f'real-or-slop-approved-local/game-copies/{prefix}_REAL/copy.webp', '--file', str(path), '--content-type', 'image/webp')
    sql(f"INSERT INTO editorial_game_copies(image_id,source_sha256,r2_key,sha256,mime,width,height,bytes,recipe,created_at) VALUES('{prefix}_REAL',"
        f"'{hashlib.sha256(original + b'REAL').hexdigest()}','game-copies/{prefix}_REAL/copy.webp','{hashlib.sha256(webp).hexdigest()}','image/webp',32,48,{len(webp)},'fixture','2026-11-09T11:00:00Z');")
    with client.open(base+view['question']['image']) as response:
        assert response.headers['Content-Type'] == 'image/webp'
        assert response.read() == webp
    # The private R2 original is untouched.
    with tempfile.TemporaryDirectory() as folder:
        copy = Path(folder) / 'copy.jpg'
        wrangler('r2', 'object', 'get', 'real-or-slop-approved-local/'+keys['REAL'], '--file', str(copy))
        assert copy.read_bytes() == original
finally:
    sql(f"DELETE FROM answers WHERE round_id IN (SELECT id FROM game_rounds WHERE session_id='{session}'); DELETE FROM game_rounds WHERE session_id='{session}'; DELETE FROM game_sessions WHERE id='{session}';")
    # Image rows stay: a game copy is immutable and references them. They are never published, so no game draws them.
print('Game media served without identifying metadata; pixels, orientation and R2 original unchanged.')
