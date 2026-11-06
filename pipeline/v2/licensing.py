"""Owner-selected public SLOP licence; never rewrites REAL or old receipts."""
import json
from pathlib import Path
from ..licenses import recognized_license
from .protocol import require

SLOP_LICENSE = json.loads((Path(__file__).resolve().parents[2] / 'shared/slop-license.v1.0.0.json').read_text())


def slop_license(value=None):
    value = value or {}
    require(isinstance(value, dict), 'Configurazione licenza SLOP non valida')
    requested = value.get('url') or SLOP_LICENSE['url']
    license_info = recognized_license(requested)
    require(license_info and license_info['url'] == SLOP_LICENSE['url'], 'Le nuove SLOP usano CC BY 4.0 con attribuzione')
    author = value.get('author') or SLOP_LICENSE['attribution']
    require(isinstance(author, str) and 0 < len(author.strip()) <= 500, 'Attribuzione SLOP richiesta')
    return dict(url=SLOP_LICENSE['url'], author=author.strip())
