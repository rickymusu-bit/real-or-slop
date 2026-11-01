"""Bounded Commons collection -> existing private review queue; never approval."""
import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError

from .importer import main as import_batch, prepare, request
from .licenses import recognized_license
from .providers import Client, PROVIDERS
from .run import connect, ingest

SITE = 'https://real-or-slop.rickymusu.workers.dev'
MAX_DAILY = 10
MAX_PENDING = 50
SCAN_LIMIT = 30
TOPICS = (
    ('historic bridge', ['ingegneria', 'ingegneria-ponti']),
    ('historic locomotive', ['trasporti', 'trasporti-treni']),
    ('unusual architecture', ['architettura', 'architettura-edifici']),
    ('museum painting', ['arte', 'arte-pittura']),
    ('historic automobile', ['automobili', 'automobili-classiche']),
)
LICENSES = ('CC0', 'Public Domain Mark', 'CC BY 4.0', 'CC BY-SA 4.0')


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(str(value or ''))
    return ' '.join(' '.join(parser.parts).split())


def plan(day):
    index = day.toordinal()
    query, categories = TOPICS[index % len(TOPICS)]
    # Rotate topics and search pages; a retry on the same date selects the same
    # page. Remote provider/source IDs and checksums remain the dedup authority.
    return dict(date=day.isoformat(), query=query + ' filetype:bitmap', categories=categories,
                offset=((index // len(TOPICS)) % 20) * SCAN_LIMIT, limit=MAX_DAILY)


def collect(folder, day):
    from PIL import UnidentifiedImageError
    folder = folder.resolve()
    folder.mkdir(parents=True, exist_ok=True)
    selection = plan(day)
    client = Client('RealOrSlop/0.10 (+' + SITE + '/)')
    config = dict(max_results=1, categories=selection['categories'], licenses=LICENSES,
                  download_hosts=['upload.wikimedia.org'])
    candidates = []
    skipped = 0
    # A fresh local DB per collection avoids retaining a failed download as a
    # completed candidate. The original/derivative files stay in this folder.
    with connect(':memory:') as db:
        rows = PROVIDERS['commons'].search(client, selection['query'], SCAN_LIMIT, offset=selection['offset'])
        for source in rows:
            if len(candidates) >= MAX_DAILY:
                break
            license = recognized_license(source.get('rights'))
            if not license or license['name'] not in LICENSES:
                skipped += 1
                continue
            metadata = json.loads(source['evidence'])
            caption = plain(metadata.get('ImageDescription', {}).get('value', '')) or plain(source['title'])
            author = plain(source['author'])
            row = {**source, 'title': plain(source['title']), 'author': plain(source['author']),
                   'description': caption[:2000],
                   'explanation': (f'La scheda della fonte descrive l’immagine come: {caption[:2000]}. '
                                   f'Autore indicato: {author}. Riferimento: {source["source_url"]}')[:3900],
                   'evidence': ('Metadati dichiarati da Wikimedia Commons; autenticità da verificare. '
                                + source['source_url'] + ' Licenza dichiarata: ' + license['url'] + ' '
                                + plain(source['evidence']))[:3900]}
            try:
                count = ingest(db, [row], config, client, True, folder / 'quarantine')
                if not count:
                    skipped += 1
                    continue
                record = db.execute('SELECT id,metadata,sha256,phash,file FROM candidates WHERE provider=? AND source_id=?',
                                    (row['provider'], row['source_id'])).fetchone()
                item = dict(id=record[0], metadata=json.loads(record[1]), sha256=record[2], phash=record[3], file=record[4])
                if not item['file']:
                    skipped += 1
                    continue
                prepare(item, folder)  # Validate each complete candidate before admitting it to the batch.
                candidates.append(item)
            except (ValueError, OSError, HTTPError, URLError, UnidentifiedImageError):
                # Do not print arbitrary upstream exceptions or credentials.
                skipped += 1
    (folder / 'manifest.json').write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + '\n')
    (folder / 'collection.json').write_text(json.dumps({**selection, 'candidates': len(candidates), 'skipped': skipped}, indent=2) + '\n')
    print(f"{len(candidates)} candidate pronte; {skipped} escluse. Solo file locali, nessuna importazione remota.")
    if not candidates:
        raise ValueError('Nessuna candidata completa raccolta: controllare fonte, filtri e disponibilità')
    return folder / 'manifest.json'


def apply(folder, day):
    token = os.environ.get('REAL_OR_SLOP_ADMIN_TOKEN', '')
    if len(token) < 32:
        raise ValueError('Configurare il segreto REAL_OR_SLOP_ADMIN_TOKEN nell’esecutore GitHub')
    # Inspect the complete local batch before any authenticated network request.
    manifest = folder.resolve() / 'manifest.json'
    if import_batch([str(manifest), '--base', SITE, '--limit', str(MAX_DAILY)]) != 0:
        raise ValueError('Anteprima locale del lotto non superata')
    health = request(SITE, token, '/api/health')
    if health.get('demo') is not True:
        raise ValueError('Il job è riservato al Worker esistente in modalità demo')
    pending = request(SITE, token, '/api/admin/images?status=in-review')
    if len(pending) >= MAX_PENDING:
        print('Coda con almeno 50 candidate: importazione sospesa fino alla revisione umana.')
        return 0
    items = list(pending)
    for status in ('approved', 'rejected'):
        items.extend(request(SITE, token, '/api/admin/images?status=' + status))
    today = day.isoformat()
    used = sum(str(item.get('created_at', '')).startswith(today) and not item.get('demo') for item in items)
    available = min(MAX_DAILY - used, MAX_PENDING - len(pending))
    if available <= 0:
        print('Limite giornaliero raggiunto; nessuna scrittura remota.')
        return 0
    # This calls only the existing import/original/asset APIs. It never calls
    # review, deployment, migration or Cloudflare account APIs.
    return import_batch([str(manifest), '--base', SITE, '--limit', str(available), '--apply'])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--collect', action='store_true', help='Raccolta live verso file locali privati')
    mode.add_argument('--apply', action='store_true', help='Importa il lotto locale nella coda privata')
    parser.add_argument('--out', type=Path, default=Path('.pipeline/automatic'))
    args = parser.parse_args(argv)
    day = datetime.now(timezone.utc).date()
    try:
        if args.collect:
            collect(args.out, day)
            return 0
        if args.apply:
            return apply(args.out, day)
        print(json.dumps(plan(day), ensure_ascii=False, indent=2))
        print('Piano soltanto: nessun accesso di rete o modifica remota.')
        return 0
    except (ValueError, OSError, HTTPError, URLError):
        print('Pipeline interrotta: controllare configurazione, fonte e accesso; nessuna approvazione automatica.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
