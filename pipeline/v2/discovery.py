"""Uncategorised, reproducible search plans and measured query yield.

Discovery engines identify candidates. Only documented source acquisitions may
enter the REAL manifest. Search results and licence strings are not authenticity.
"""
import argparse
import hashlib
import json
import random
from pathlib import Path
from .protocol import VERSION, exact, require, text, identifier
from ..editorial import PipelineStop, write_private
from ..providers import PROVIDERS, Client
from ..run import connect, ingest

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
Restituisci JSON con un solo campo queries: lista di stringhe. Non occorrono riferimenti a immagini specifiche.'''


def plan(seed, exploratory, engines=('commons', 'openverse'), count=12, vocabulary=None):
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


def collect(search_plan, folder, user_agent, limit=10, licenses=(), download_hosts=(), searchers=None):
    """Only explicit callers invoke network. Provider errors stop, never scrape.

    searchers may supply another terms-reviewed discovery adapter. Such adapters
    must return source records compatible with the verified-source acquisition
    contract; a bare image-search hit is deliberately insufficient.
    """
    require(search_plan.get('version') == VERSION and type(limit) is int and 1 <= limit <= 50, 'Piano o limite ricerca non valido')
    registry = searchers or PROVIDERS
    client = Client(user_agent)
    folder = folder.resolve()
    folder.mkdir(parents=True, exist_ok=True)
    logs = []
    with connect(folder / 'collection.sqlite') as db:
        for query in search_plan['queries']:
            identifier(query['id'])
            require(query['engine'] in registry, 'Motore non configurato: ' + query['engine'])
            before = client.calls
            rows = list(registry[query['engine']].search(client, query['query'], limit))[:limit]
            # Existing ingest preserves raw rights/evidence/originals. No categories.
            new = ingest(db, rows, dict(max_results=limit, categories=[], licenses=list(licenses), download_hosts=list(download_hosts)), client, bool(download_hosts), folder / 'quarantine')
            logs.append({**query, 'examined': len(rows), 'new_candidates': new, 'api_calls': client.calls - before,
                         'cost_usd': None, 'approved': None, 'visual_novelty': None})
            write_private(folder / 'queries.json', dict(version=VERSION, queries=logs))
        manifest = [dict(id=row[0], metadata=json.loads(row[1]), sha256=row[2], phash=row[3], file=row[4])
                    for row in db.execute('SELECT id,metadata,sha256,phash,file FROM candidates ORDER BY id')]
    write_private(folder / 'manifest.json', manifest)
    return dict(candidates=len(manifest), queries=len(logs), paid=False, published=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exploratory', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=34)
    parser.add_argument('--count', type=int, default=12)
    parser.add_argument('--engines', nargs='+', default=['commons', 'openverse'])
    parser.add_argument('--out', type=Path, default=Path('.pipeline/v2/discovery'))
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--user-agent')
    parser.add_argument('--download-hosts', nargs='*', default=[])
    args = parser.parse_args(argv)
    try:
        value = plan(args.seed, json.loads(args.exploratory.read_text()), args.engines, args.count)
        write_private(args.out / 'plan.json', value)
        if args.live:
            print(json.dumps(collect(value, args.out, args.user_agent, download_hosts=args.download_hosts)))
        else:
            print(json.dumps(dict(queries=len(value['queries']), paid=False, network=False, plan=str(args.out / 'plan.json'))))
        return 0
    except (ValueError, OSError, TypeError, KeyError) as error:
        print(str(error) if isinstance(error, PipelineStop) else 'Scoperta v2 interrotta; controllare il piano e le fonti')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
