"""Restore owner-authorized private transfer blobs and verify both ZIP files."""
import base64
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

manifest = json.loads(Path('.github/private-import-transfer.json').read_text())
assert manifest['private'] is True
assert manifest['repository'] == os.environ['GITHUB_REPOSITORY']
root = Path('.pipeline/import-source')
root.mkdir(parents=True, exist_ok=True)
root.chmod(0o700)
for asset in manifest['assets']:
    assert asset['name'] in ('confronto-editoriale-20.zip', 'archivio-completo-20.zip')
    path = root / asset['name']
    digest = hashlib.sha256()
    size = 0
    with path.open('wb') as target:
        for part in asset['parts']:
            req = Request('https://api.github.com/repos/' + manifest['repository'] + '/git/blobs/' + part['sha'], headers={
                'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                'Accept': 'application/vnd.github+json', 'User-Agent': 'RealOrSlop-private-import',
            })
            with urlopen(req, timeout=120) as response:
                raw = response.read(16_000_001)
            assert len(raw) <= 16_000_000
            value = json.loads(raw)
            assert value['encoding'] == 'base64'
            data = base64.b64decode(value['content'])
            assert len(data) == part['size'] and hashlib.sha256(data).hexdigest() == part['sha256']
            target.write(data)
            size += len(data)
            digest.update(data)
    path.chmod(0o600)
    assert size == asset['size'] and digest.hexdigest() == asset['sha256']
    print(json.dumps(dict(verified_asset=asset['name'], bytes=size)), flush=True)
