"""REAL discovery CLI. Offline inspection by default; paid stages need explicit gates."""
import argparse
import json
import os
from pathlib import Path

from ..editorial import PipelineStop
from ..v2.protocol import require
from .benchmark import compare
from .acquisition import acquire
from .contracts import VERSION, matrix, select, validate
from .planning import Model, Reservation
from .providers import PROFILES, retrieve
from .review import prepare, profile, review, shortlist, verify_media, document_path, profile_path
from .store import Store


def plan(store, model, revision=1, baseline=False, strategies=None, count=5, providers=None):
    providers = list(PROFILES) if providers is None else list(providers)
    require(providers and len(set(providers)) == len(providers) and all(p in PROFILES for p in providers), 'Provider non validi')
    prior = store.read(f'plan.r{revision}.v1.0.0.json')
    if prior is not None:
        require(prior['baseline'] == baseline and {q['provider'] for q in prior['queries']} == set(providers), 'Piano diverso: usare una nuova revisione')
        saved = store.read(f'strategies.r{revision}.v1.0.0.json')
        require(saved is not None and (strategies == saved if strategies is not None else len(saved['strategies']) == count), 'Strategie diverse dal piano salvato')
        return prior
    strategies = validate('strategies', strategies) if strategies is not None else model.strategies(count, revision)
    store.save(f'strategies.r{revision}.v1.0.0.json', strategies, immutable=True)
    rows = []
    for strategy in strategies['strategies']:
        for provider in providers:
            provider_profile = PROFILES[provider]
            adapted = dict(variants=[dict(mode='text', query=strategy['query'], category=None, language='en')]) if baseline else model.adapt(strategy, provider_profile, revision)
            rows.append(dict(strategy_id=strategy['id'], provider=provider, adapted=adapted))
    return store.save(f'plan.r{revision}.v1.0.0.json', dict(version=VERSION, baseline=baseline, queries=rows), immutable=True)


def collect(store, revision=1, max_calls=30, page_size=20, max_pages=1, client_factory=None, commons_bitmap=False):
    saved = store.read(f'plan.r{revision}.v1.0.0.json')
    require(saved is not None, 'Piano query necessario prima del retrieval')
    policy = dict(max_calls=max_calls, page_size=page_size, max_pages=max_pages)
    if commons_bitmap:
        policy['commons_bitmap'] = True
    store.save('retrieval-policy.v1.0.0.json', policy, immutable=True)
    results, disabled, skipped = [], set(), []
    for query in saved['queries']:
        if query['provider'] in disabled:
            skipped.append(dict(strategy_id=query['strategy_id'], provider=query['provider'], reason='provider_stopped_after_error'))
            continue
        adapted = compile_query(query['provider'], query['adapted'], commons_bitmap)
        result = retrieve(store, query['provider'], adapted,
            os.getenv('REAL_DISCOVERY_USER_AGENT', 'RealOrSlop/1.0 (https://github.com/rickymusu-bit/real-or-slop)'),
            client=client_factory(max_calls) if client_factory else None, max_calls=max_calls,
            page_size=page_size, max_pages=max_pages, revision=revision)
        results.append(result)
        if result['status'] in ('partial', 'rate_limited', 'error', 'uncertain'):
            disabled.add(query['provider'])
    store.save(f'collection.r{revision}.v1.0.0.json', dict(proposed_queries=len(saved['queries']), skipped=skipped))
    return results


def compile_query(provider, adapted, bitmap=False):
    """Code-owned file filter, never a GPT-owned HTTP parameter."""
    validate('adaptation', adapted)
    if provider != 'commons' or not bitmap:
        return adapted
    return validate('adaptation', dict(variants=[{**row, 'query': row['query'] if row['query'].endswith(' filetype:bitmap')
        else row['query']+' filetype:bitmap'} for row in adapted['variants']]))


def fixture(folder):
    from .fixtures import FixtureAPI, search_client, documentary_manifest
    stores = []
    for arm in ('baseline', 'adapted'):
        store = Store(Path(folder)/arm)
        with store.lock():
            store.freeze(dict(version=VERSION, taxonomy_version=VERSION, topic='animals', emotion='compassion', intensity='medium'), simulated=True)
            model = Model(store, 'fixture-gpt', FixtureAPI(), fixture=True)
            plan(store, model, baseline=arm == 'baseline')
            results = collect(store, client_factory=search_client)
            hits = {(row['provider'], row['source_id']): row for r in results for row in r['candidates']}
            records = documentary_manifest(store, list(hits.values()))
            prepare(store, records, store.folder)
            profiles = profile(store, model)
            store.save('shortlist.r1.v1.0.0.json', shortlist(profiles), immutable=True)
            review(store, profiles, [dict(candidate_id=row['id'], sha256=row['sha256'], decision='approved',
                reviewer='SYNTHETIC FIXTURE; NOT OWNER APPROVAL', revision=1, confirm_reviewed=True) for row in profiles])
        stores.append(store)
    result = compare(*stores)
    Store(folder).save('benchmark.v1.0.0.json', result, immutable=True)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['matrix', 'prepare', 'plan', 'retrieve', 'acquire', 'document', 'profile', 'review', 'gallery', 'feedback', 'export', 'benchmark', 'fixture'])
    parser.add_argument('--out', type=Path, default=Path('.pipeline/real-discovery'))
    parser.add_argument('--topic'); parser.add_argument('--emotion'); parser.add_argument('--intensity', choices=['low', 'medium', 'high'])
    parser.add_argument('--seed', type=int, default=56)
    parser.add_argument('--history', type=Path)
    parser.add_argument('--slop-plan', type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--strategies', type=Path)
    parser.add_argument('--revision', type=int, default=1)
    parser.add_argument('--document-revision', type=int, default=1)
    parser.add_argument('--thumbnails', type=Path)
    parser.add_argument('--count', type=int, default=5)
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--provider', action='append', choices=list(PROFILES))
    parser.add_argument('--commons-bitmap', action='store_true')
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--model'); parser.add_argument('--base'); parser.add_argument('--run-id')
    parser.add_argument('--max-calls', type=int, default=30)
    parser.add_argument('--page-size', type=int, default=20)
    parser.add_argument('--max-pages', type=int, default=1)
    parser.add_argument('--download-host', action='append', default=[])
    parser.add_argument('--baseline-dir', type=Path)
    args = parser.parse_args(argv)
    def read(path):
        require(path is not None, '--manifest/file richiesto')
        return json.loads(path.read_text())
    try:
        require(args.revision > 0, 'Revisione positiva richiesta')
        if args.action == 'matrix':
            cells = matrix()
            print(json.dumps(dict(version=VERSION, combinations=len(cells), meaningful=sum(x['meaningful'] for x in cells), cells=cells)))
            return 0
        if args.action == 'fixture':
            result = fixture(args.out)
            print(json.dumps(result)); return 0
        store = Store(args.out)
        with store.lock():
            if args.action == 'prepare':
                if any((args.topic, args.emotion, args.intensity)):
                    intent = dict(version=VERSION, taxonomy_version=VERSION, topic=args.topic, emotion=args.emotion, intensity=args.intensity)
                else:
                    from .feedback import load_history
                    intent = select(args.seed, load_history(args.history) if args.history else [])[0]
                result = store.freeze(intent, read(args.slop_plan) if args.slop_plan else None,
                                      selection_seed=args.seed if not args.topic else None)
            elif args.action in ('plan', 'profile'):
                store.frozen()
                if args.action == 'plan' and args.baseline and args.strategies:
                    result = plan(store, None, args.revision, True, read(args.strategies), args.count, args.provider)
                elif not args.execute:
                    result = dict(action=args.action, network=False, paid=False, execute_required=True)
                else:
                    require(args.model and args.run_id, '--model e --run-id espliciti richiesti')
                    model = Model(store, args.model, reservation=Reservation(args.base,
                        os.getenv('REAL_OR_SLOP_ADMIN_TOKEN', ''), args.run_id))
                    if args.action == 'plan':
                        result = plan(store, model, args.revision, args.baseline,
                                      read(args.strategies) if args.strategies else None, args.count, args.provider)
                    else:
                        rows = profile(store, model, args.revision, args.document_revision)
                        result = store.save(profile_path(args.revision, args.document_revision).replace('profiled.', 'shortlist.'), shortlist(rows), immutable=True)
            elif args.action == 'retrieve':
                store.frozen()
                result = collect(store, args.revision, args.max_calls, args.page_size, args.max_pages, commons_bitmap=args.commons_bitmap) if args.live else dict(network=False, paid=False, live_required=True)
            elif args.action == 'document':
                rows = prepare(store, read(args.manifest), args.manifest.resolve().parent, args.document_revision)
                result = dict(candidates=len(rows), documentary_eligible=sum(not row['blockers'] for row in rows), published=False)
            elif args.action == 'acquire':
                result = acquire(store, args.download_host,
                    os.getenv('REAL_DISCOVERY_USER_AGENT', 'RealOrSlop/1.0 (https://github.com/rickymusu-bit/real-or-slop)'),
                    revision=args.revision) if args.live else dict(network=False, paid=False, live_required=True)
            elif args.action == 'review':
                rows = store.read(profile_path(args.revision, args.document_revision))
                require(rows is not None, 'Profili mancanti')
                result = review(store, rows, read(args.manifest))
                from .feedback import synchronize
                synchronize(store, rows)
            elif args.action == 'gallery':
                from .gallery import render
                rows = store.read(profile_path(args.revision, args.document_revision)) or store.read(document_path(args.document_revision))
                selection = store.read(profile_path(args.revision, args.document_revision).replace('profiled.', 'shortlist.')) or {}
                result = render(store, rows, selection.get('shortlisted', []), read(args.thumbnails) if args.thumbnails else None)
            elif args.action == 'feedback':
                from .feedback import synchronize
                result = synchronize(store, store.read(document_path(args.document_revision)) or [])
            elif args.action == 'export':
                require(not store.frozen()['simulated'], 'Fixture non esportabili al flusso reale')
                rows = store.read(document_path(args.document_revision))
                require(rows is not None, 'Dossier mancanti')
                for row in rows:
                    verify_media(store, row)
                result = dict(version=VERSION, review_required=True, published=False, manifest=[dict(id=row['id'],
                    file=str(store.folder/row['file']), provenance=row['provenance']) for row in rows if not row['blockers'] and not row.get('duplicate_of')])
                store.save('export.v1.0.0.json', result, immutable=True)
            else:
                require(args.baseline_dir is not None, '--baseline-dir richiesto')
                result = compare(Store(args.baseline_dir), store)
        print(json.dumps(result)); return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(str(error) if isinstance(error, PipelineStop) else 'Discovery interrotta; controllare ricevute e configurazione private')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
