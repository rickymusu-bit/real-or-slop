"""v1.0.0, 2026-11-09T12:00:00Z: test stand-in for the browser encoder (src/game-copy.v1.0.0.ts).
Same recipe as shared/game-copy.v1.0.0.ts: EXIF orientation applied, longest side <= 2048, WebP q85, no metadata."""
import io
import json
import urllib.error
import urllib.request
from PIL import Image, ImageOps

def encode(source: bytes, size=None, fmt='WEBP') -> bytes:
    picture = ImageOps.exif_transpose(Image.open(io.BytesIO(source))).convert('RGB')
    scale = min(1, 2048 / max(picture.size))
    picture = picture.resize(size or (max(1, int(picture.width*scale+.5)), max(1, int(picture.height*scale+.5))))
    out = io.BytesIO(); picture.save(out, fmt, quality=85); return out.getvalue()

def upload(base: str, token: str, inbox_id: str, source_sha: str, data: bytes, mime='image/webp'):
    req = urllib.request.Request(f'{base}/api/admin/review-inbox/{inbox_id}/game-copy?source_sha256={source_sha}', data=data,
                                 method='POST', headers={'Authorization': 'Bearer '+token, 'Content-Type': mime})
    try:
        with urllib.request.urlopen(req) as response: return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error: return error.code, json.loads(error.read())

def prepare(base: str, token: str, inbox_id: str, source_sha: str, source: bytes) -> str:
    """Registers the game copy and returns its hash: the sha the owner then approves."""
    status, result = upload(base, token, inbox_id, source_sha, encode(source))
    assert status in (200, 201), (status, result)
    return result['sha256']
