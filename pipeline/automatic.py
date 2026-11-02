"""Bounded Commons collection -> existing private review queue; never approval."""
import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError

from .importer import prepare, RequestError
from .licenses import recognized_license
from .providers import Client, PROVIDERS
from .run import connect, ingest

SITE = 'https://real-or-slop.rickymusu.workers.dev'
MAX_DAILY = 20
SCAN_LIMIT = 30
TOPICS = (
    ('historic bridge', ['ingegneria', 'ingegneria-ponti']),
    ('historic locomotive', ['trasporti', 'trasporti-treni']),
    ('unusual architecture', ['architettura', 'architettura-edifici']),
    ('unusual wildlife photograph', ['scienza', 'scienza-ricerca']),
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


def plan(day, limit=MAX_DAILY):
    if type(limit) is not int or not 1 <= limit <= MAX_DAILY:
        raise ValueError('Il lotto deve contenere da 1 a 20 fotografie')
    index = day.toordinal()
    topics = TOPICS[index % len(TOPICS):] + TOPICS[:index % len(TOPICS)]
    return dict(date=day.isoformat(), limit=limit,
                queries=[dict(query=query + ' filetype:bitmap', categories=categories,
                              offset=((index // len(TOPICS)) % 20) * SCAN_LIMIT)
                         for query, categories in topics])


def collect(folder, day, limit=MAX_DAILY):
    from itertools import zip_longest
    from PIL import UnidentifiedImageError
    folder = folder.resolve()
    folder.mkdir(parents=True, exist_ok=True)
    selection = plan(day, limit)
    client = Client('RealOrSlop/1.0 (+' + SITE + '/)')
    candidates, skipped = [], 0
    # Interleave independent topics AND pages. No single first page can dominate.
    streams = [iter(PROVIDERS['commons'].search(client, topic['query'], SCAN_LIMIT,
               offset=topic['offset'] + page * SCAN_LIMIT))
               for page in range(2) for topic in selection['queries']]
    per_topic = [0] * len(TOPICS)
    # Persistent IDs and fingerprints across collections; incomplete downloads
    # are not admitted to the daily reference lot.
    from .editorial import same_photo
    with connect(folder / 'collection.sqlite') as db:
        for group in zip_longest(*streams):
            if len(candidates) >= limit:
                break
            for stream_index, source in enumerate(group):
                topic_index = stream_index % len(TOPICS)
                if source is None or per_topic[topic_index] >= 4 or len(candidates) >= limit:
                    continue
                license = recognized_license(source.get('rights'))
                if not license or license['name'] not in LICENSES or 'ND' in license['name']:
                    skipped += 1
                    continue
                metadata = json.loads(source['evidence'])
                caption = plain(metadata.get('ImageDescription', {}).get('value', '')) or plain(source['title'])
                author = plain(source['author'])
                row = {**source, 'title': plain(source['title']), 'author': author, 'description': caption[:2000],
                       'explanation': (f'La scheda della fonte descrive l’immagine come: {caption[:2000]}. '
                                       f'Autore indicato: {author}. Riferimento: {source["source_url"]}')[:3900],
                       'evidence': ('Metadati dichiarati da Wikimedia Commons; autenticità da verificare. '
                                    + source['source_url'] + ' Licenza dichiarata: ' + license['url'] + ' '
                                    + plain(source['evidence']))[:3900]}
                config = dict(max_results=1, categories=selection['queries'][topic_index]['categories'],
                              licenses=LICENSES, download_hosts=['upload.wikimedia.org'])
                try:
                    if not ingest(db, [row], config, client, True, folder / 'quarantine'):
                        skipped += 1
                        continue
                    record = db.execute('SELECT id,metadata,sha256,phash,file FROM candidates WHERE provider=? AND source_id=?',
                                        (row['provider'], row['source_id'])).fetchone()
                    item = dict(id=record[0], metadata=json.loads(record[1]), sha256=record[2], phash=record[3], file=record[4])
                    if not item['file'] or item['metadata'].get('possible_duplicate') or any(same_photo(item, p) for p in candidates):
                        skipped += 1
                        continue
                    prepare(item, folder)
                    candidates.append(item)
                    per_topic[topic_index] += 1
                except (ValueError, OSError, HTTPError, URLError, UnidentifiedImageError):
                    skipped += 1
    (folder / 'manifest.json').write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + '\n')
    (folder / 'collection.json').write_text(json.dumps({**selection, 'candidates': len(candidates), 'skipped': skipped}, indent=2) + '\n')
    print(f"{len(candidates)} fotografie ammissibili; {skipped} escluse. Nessuna importazione o valutazione a pagamento.")
    return folder / 'manifest.json'


def apply(folder, day):
    # The old unranked direct importer must never publish the lower half as REAL.
    from .editorial import main as editorial_main
    return editorial_main([str(folder.resolve() / 'manifest.json'), '--execute', '--base', SITE,
                           '--out', str(folder.resolve() / 'editorial')])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--collect', action='store_true', help='Raccolta live verso file locali privati')
    mode.add_argument('--apply', action='store_true', help='Importa il lotto locale nella coda privata')
    parser.add_argument('--limit', type=int, choices=range(1, MAX_DAILY + 1), default=MAX_DAILY, help='Massimo di fotografie per la raccolta (1–20)')
    parser.add_argument('--out', type=Path, default=Path('.pipeline/automatic'))
    args = parser.parse_args(argv)
    day = datetime.now(timezone.utc).date()
    try:
        if args.collect:
            collect(args.out, day, args.limit)
            return 0
        if args.apply:
            return apply(args.out, day)
        print(json.dumps(plan(day, args.limit), ensure_ascii=False, indent=2))
        print('Piano soltanto: nessun accesso di rete o modifica remota.')
        return 0
    except RequestError as error:
        print('Pipeline interrotta: ' + str(error))
        return 1
    except (ValueError, OSError, HTTPError, URLError):
        print('Pipeline interrotta: controllare configurazione, fonte e accesso; nessuna approvazione automatica.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
