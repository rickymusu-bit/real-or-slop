"""Uncategorised, reproducible search plans and measured query yield.

Discovery engines identify candidates. Only documented source acquisitions may
enter the REAL manifest. Search results and licence strings are not authenticity.
"""
import argparse
import hashlib
import json
import random
import fcntl
import math
import time
from pathlib import Path
from urllib.error import HTTPError
from .protocol import VERSION, exact, require, text, identifier, https
from ..editorial import PipelineStop, write_private
from ..run import connect, ingest
from .search_sources import DEFAULT_ENGINES, SearchClient, ConfigurationMissing, CallLimit, registry as source_registry
from .editorial_policy import BACKGROUND_RULE

VOCABULARY = {
    'materials': ['glass', 'wood', 'fabric', 'stone', 'metal', 'water'],
    'processes': ['corrosion', 'growth', 'erosion', 'assembly', 'drying'],
    'relations': ['reflection', 'overlap', 'contact', 'repetition', 'submerged'],
    'environments': ['indoors', 'outdoors', 'workplace', 'public space'],
    'techniques': ['macro photography', 'wide angle photograph', 'long exposure', 'snapshot']
}
GENERIC = ['photograph', 'everyday photograph', 'documentary photograph', 'photographic texture']
EXPLORATION_INSTRUCTIONS = '''Proponi query di ricerca di fotografie indipendenti da categorie o vocabolari prefissati.
Esplora liberamente scene, relazioni, materiali, composizioni, dettagli, texture, immagini quotidiane e sorprendenti.
Non privilegiare lo strano, il bello o soggetti isolati. Non usare candidate REAL, prompt SLOP o preferenze editoriali pregresse.
Restituisci JSON con un solo campo queries: lista di stringhe. Non occorrono riferimenti a immagini specifiche.''' + '\n' + BACKGROUND_RULE


def plan(seed, exploratory, engines=DEFAULT_ENGINES, count=12, vocabulary=None):
    require(type(seed) is int and type(count) is int and 4 <= count <= 40, 'Seed o numero query non valido')
    exact(exploratory, ('generator', 'queries'), 'Query esplorative indipendenti')
    require(text(exploratory['generator'], 150) and isinstance(exploratory['queries'], list) and bool(exploratory['queries']) and all(text(q, 300) for q in exploratory['queries']), 'Query libere e identificativo generatore richiesti')
    require(bool(engines) and len(set(engines)) == len(engines) and all(text(e, 100) for e in engines), 'Motori non validi')
    vocab = vocabulary or VOCABULARY
    require(isinstance(vocab, dict) and len(vocab) >= 2 and all(isinstance(items, list) and items and all(text(item, 100) for item in items) for items in vocab.values()), 'Vocabolario non valido')
    rng = random.Random(seed)
    free = list(dict.fromkeys(exploratory['queries']))
    rng.shuffle(free)
    # Exploration has reserved slots; past yield never consumes its budget.
    free_count = max(1, count // 3)
    require(len(free) >= free_count, 'Servono più query libere distinte per il budget esplorativo')
    generic_count = max(1, count // 6)
    selected = [('exploration', q) for q in free[:free_count]]
    selected += [('generic', GENERIC[i % len(GENERIC)]) for i in range(generic_count)]
    seen = {q for _, q in selected}
    for _ in range(1000):
        if len(selected) == count:
            break
        a, b = rng.sample(list(vocab), 2)
        query = rng.choice(vocab[a]) + ' ' + rng.choice(vocab[b]) + ' photograph'
        if query not in seen:
            selected.append(('vocabulary', query))
            seen.add(query)
    require(len(selected) == count, 'Vocabolario insufficiente per query distinte')
    rng.shuffle(selected)
    queries = []
    for index, (channel, query) in enumerate(selected):
        for engine in engines:
            uid = hashlib.sha256((engine + '\0' + channel + '\0' + query).encode()).hexdigest()[:24]
            queries.append(dict(id=uid, engine=engine, channel=channel, query=query, allocation=index, exploratory_generator=exploratory['generator'] if channel == 'exploration' else None))
    return dict(version=VERSION, seed=seed, queries=queries, exploration_slots=free_count, paid=False, remote_writes=False)


def collect(search_plan, folder, user_agent, limit=10, licenses=(), download_hosts=(), searchers=None,
            client=None, max_api_calls=120, openverse_sources=(), allow_paid_search=False,
            search_budget_usd=0, brave_request_usd=0):
    """Resumable multi-source discovery. Errors isolate providers, never scrape.

    General image-search hits are recorded separately: they do not become REAL
    manifests, downloaded files or authenticity claims. Costs remain unknown
    until measured; explicit paid-search reservations are conservative limits.
    """
    require(search_plan.get('version') == VERSION and type(limit) is int and 1 <= limit <= 50, 'Piano o limite ricerca non valido')
    require(all(type(n) in (int, float) and math.isfinite(n) and n >= 0 for n in (search_budget_usd, brave_request_usd)), 'Budget ricerca non valido')
    registry = source_registry(openverse_sources) if searchers is None else searchers
    queries = search_plan['queries']
    require(isinstance(queries, list) and 1 <= len(queries) <= 400 and len({q['id'] for q in queries}) == len(queries), 'Query duplicate o piano non valido')
    for query in queries:
        identifier(query['id'])
        require(query['engine'] in registry and text(query['query'], 300), 'Motore non configurato o query non valida')
    client = client or SearchClient(user_agent, max_calls=max_api_calls)
    config = dict(plan=search_plan, limit=limit, licenses=list(licenses), download_hosts=list(download_hosts),
                  max_api_calls=max_api_calls, openverse_sources=list(openverse_sources), allow_paid_search=allow_paid_search,
                  search_budget_usd=search_budget_usd, brave_request_usd=brave_request_usd)
    fingerprint = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    folder = folder.resolve()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (folder / '.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise PipelineStop('Raccolta già in esecuzione') from None
        path = folder / 'queries.json'
        if path.exists():
            journal = json.loads(path.read_text())
            require(journal.get('fingerprint') == fingerprint, 'Piano o limiti diversi dal checkpoint')
        else:
            require(not (folder / 'collection.sqlite').exists(), 'Archivio privo di journal: usare una cartella nuova')
            journal = dict(version=VERSION, fingerprint=fingerprint, queries=[], used_api_calls=0, reserved_search_usd=0, hits=[])
            write_private(folder / 'plan.json', search_plan)
        logs = journal['queries']
        client.calls = journal['used_api_calls']
        disabled = {r['engine'] for r in logs if r['status'] in ('error', 'partial', 'started', 'uncertain', 'not_configured')}
        for row in logs:
            if row['status'] == 'started':
                row['status'] = 'uncertain'

        def save():
            journal['used_api_calls'] = client.calls
            write_private(path, journal)

        # Debit API call allowance before each HTTP request, including OAuth.
        client.on_call = save
        save()
        with connect(folder / 'collection.sqlite') as db:
            for query in queries:
                if any(row['id'] == query['id'] for row in logs):
                    continue
                entry = {**query, 'status': 'started', 'returned': None, 'examined': None, 'new_candidates': 0,
                         'api_calls': 0, 'cost_usd': None, 'approved': None, 'visual_novelty': None, 'reserved_usd': 0}
                logs.append(entry)
                provider = registry[query['engine']]
                if query['engine'] in disabled:
                    entry.update(status='skipped', reason='provider_disabled_after_error')
                    save()
                    continue
                if getattr(provider, 'paid', False):
                    configured = allow_paid_search and brave_request_usd > 0 and search_budget_usd > 0
                    if not configured or round(journal['reserved_search_usd'] + brave_request_usd, 6) > search_budget_usd:
                        entry.update(status='not_configured', reason='paid_search_disabled_or_budget_exhausted')
                        disabled.add(query['engine'])
                        save()
                        continue
                    entry['reserved_usd'] = brave_request_usd
                    journal['reserved_search_usd'] = round(journal['reserved_search_usd'] + brave_request_usd, 6)
                save()  # Durable intent/reservation before network; no retries on resume.
                before_calls = client.calls
                before_count = db.execute('SELECT COUNT(*) FROM candidates').fetchone()[0]
                started = time.monotonic()
                rows = []
                try:
                    if query['engine'] == 'smithsonian' and not getattr(client, 'env', {}).get('SMITHSONIAN_API_KEY'):
                        raise ConfigurationMissing('SMITHSONIAN_API_KEY mancante')
                    for row in provider.search(client, query['query'], limit):
                        rows.append(row)
                        if len(rows) == limit:
                            break
                    entry.update(status='completed', returned=len(rows))
                except (OSError, ValueError, KeyError, TypeError) as error:
                    entry.update(status='not_configured' if isinstance(error, ConfigurationMissing) else ('partial' if rows else 'error'),
                                 returned=len(rows) if rows else None, error_type=type(error).__name__,
                                 http_status=error.code if isinstance(error, HTTPError) else None)
                    disabled.add(query['engine'])
                # Raw normalized records survive acquisition errors and interruptions.
                write_private(folder / 'responses' / (query['id'] + '.json'), rows)
                if getattr(provider, 'discovery_only', False):
                    existing = {(r['source_url'], r['image_url']) for r in journal['hits']}
                    for rank, row in enumerate(rows, 1):
                        if https(row.get('source_url')) and https(row.get('image_url')) and (row['source_url'], row['image_url']) not in existing:
                            journal['hits'].append({**row, 'query_id': query['id'], 'engine': query['engine'], 'rank': rank})
                            existing.add((row['source_url'], row['image_url']))
                else:
                    try:
                        ingest(db, rows, dict(max_results=limit, categories=[], licenses=list(licenses), download_hosts=list(download_hosts)),
                               client, bool(download_hosts), folder / 'quarantine')
                    except (OSError, ValueError, KeyError, TypeError) as error:
                        # Preserve successful inserts preceding a failed download.
                        db.commit()
                        entry.update(status='partial' if rows else 'error', acquisition_error=type(error).__name__)
                entry.update(new_candidates=db.execute('SELECT COUNT(*) FROM candidates').fetchone()[0] - before_count,
                             api_calls=client.calls - before_calls, elapsed_seconds=round(time.monotonic() - started, 4))
                save()
            manifest = [dict(id=row[0], metadata=json.loads(row[1]), sha256=row[2], phash=row[3], file=row[4])
                        for row in db.execute('SELECT id,metadata,sha256,phash,file FROM candidates ORDER BY id')]
        write_private(folder / 'manifest.json', manifest)
        write_private(folder / 'hits.json', dict(hits=journal['hits'], status='source_verification_pending'))
        return dict(candidates=len(manifest), hits=len(journal['hits']), queries=len(logs),
                    status='completed' if all(r['status'] == 'completed' for r in logs) else 'partial',
                    errors=sum(r['status'] in ('error', 'partial', 'uncertain') for r in logs),
                    used_api_calls=client.calls, reserved_search_usd=journal['reserved_search_usd'],
                    paid=journal['reserved_search_usd'] > 0, published=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exploratory', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=34)
    parser.add_argument('--count', type=int, default=12)
    parser.add_argument('--engines', nargs='+', default=list(DEFAULT_ENGINES))
    parser.add_argument('--out', type=Path, default=Path('.pipeline/v2/discovery'))
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--user-agent')
    parser.add_argument('--download-hosts', nargs='*', default=[])
    parser.add_argument('--max-api-calls', type=int, default=120)
    parser.add_argument('--openverse-sources', nargs='*', default=[])
    parser.add_argument('--allow-paid-search', action='store_true')
    parser.add_argument('--search-budget-usd', type=float, default=0)
    parser.add_argument('--brave-request-usd', type=float, default=0)
    args = parser.parse_args(argv)
    try:
        value = plan(args.seed, json.loads(args.exploratory.read_text()), args.engines, args.count)
        if args.live:
            result = collect(value, args.out, args.user_agent, download_hosts=args.download_hosts,
                             max_api_calls=args.max_api_calls, openverse_sources=args.openverse_sources,
                             allow_paid_search=args.allow_paid_search, search_budget_usd=args.search_budget_usd,
                             brave_request_usd=args.brave_request_usd)
            print(json.dumps(result))
            return 0 if result['status'] == 'completed' else 2
        else:
            if (args.out / 'queries.json').exists():
                require(json.loads((args.out / 'plan.json').read_text()) == value, 'Un piano diverso richiede una cartella nuova')
            write_private(args.out / 'plan.json', value)
            print(json.dumps(dict(queries=len(value['queries']), paid=False, network=False, plan=str(args.out / 'plan.json'))))
        return 0
    except (ValueError, OSError, TypeError, KeyError) as error:
        print(str(error) if isinstance(error, PipelineStop) else 'Scoperta v2 interrotta; controllare il piano e le fonti')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
