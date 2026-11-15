"""Publishes a small catalogue of REAL (with a description) and SLOP photos through the admin API of the local Worker, for
the game checks, and removes it afterwards."""
import io
import json
import urllib.error
import urllib.parse
import urllib.request
from PIL import Image

def _call(api, token, path, data=None, raw=None, mime='application/json', method=None):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(api + path, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': mime, 'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req) as r: return json.loads(r.read())

def publish(api, token, prefix, real=10, slop=10, seed=0):
    """Uploads, copies (nearest format, spec `copie-di-gioco`), tags, approves and publishes `real` REAL and `slop` SLOP photos; returns their ids by origin."""
    ids = {'REAL': [], 'SLOP': []}
    for index, origin in enumerate(['REAL'] * real + ['SLOP'] * slop):
        picture = Image.new('RGB', (40, 50)); n = seed * 1000 + index
        picture.putdata([((n * 37 + x) % 256, (n * 11 + y * 3) % 256, (n * 5) % 256) for y in range(50) for x in range(40)])
        out = io.BytesIO(); picture.save(out, 'PNG')
        item = _call(api, token, '/upload?' + urllib.parse.urlencode({'origin': origin, 'title': f'{prefix}-{origin}-{index}',
                     'prompt': f'A street scene number {index}, 1960s' if origin == 'SLOP' else '',
                     'description': f'Descrizione della foto {index}' if origin == 'REAL' else ''}), raw=out.getvalue(), mime='image/png')
        item = _call(api, token, f'/{item["id"]}/copy', data={})
        item = _call(api, token, f'/{item["id"]}', {'revision': item['revision'], 'tags': [f'{prefix}-tag'],
                     'tag_categories': {f'{prefix}-tag': 'other'}}, method='PATCH')
        _call(api, token, f'/{item["id"]}/approve', {'rights_confirmed': True})
        _call(api, token, f'/{item["id"]}/publish', {})
        ids[origin].append(item['id'])
    return ids

def remove(api, token, ids):
    """Withdraws, trashes and deletes for good the given photos; returns what the server answered."""
    every = ids['REAL'] + ids['SLOP']
    for image_id in every:
        for action in ('withdraw', 'trash'):
            try: _call(api, token, f'/{image_id}/{action}', {})
            except urllib.error.HTTPError: pass
    return _call(api, token, '/bulk', {'action': 'delete', 'ids': every})
