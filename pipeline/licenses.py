"""Published CC identities shared with Worker moderation; no automatic approval."""
import json
import re
from pathlib import Path

LICENSES = json.loads((Path(__file__).resolve().parents[1] / 'shared' / 'licenses.json').read_text())
_URL = re.compile(r'https?://(?:www\.)?creativecommons\.org(/[^\s?#%\\]*)', re.IGNORECASE)
_DOCUMENT = re.compile(r'/(?:deed|legalcode)(?:\.[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*)?/?$', re.IGNORECASE)


def recognized_license(value):
    if not isinstance(value, str) or len(value) > 500:
        return None
    match = _URL.fullmatch(value.strip())
    if not match:
        return None
    path = _DOCUMENT.sub('/', match.group(1))
    url = 'https://creativecommons.org' + (path if path.endswith('/') else path + '/')
    name = LICENSES.get(url)
    return {'url': url, 'name': name} if name else None
