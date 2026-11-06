"""Two-stage model pilot with sealed query receipts and equal Commons retrieval."""
import argparse
import json
import os
from pathlib import Path

from ..editorial import PipelineStop, now, vision_result
from ..v2.protocol import require
from .benchmark import summarize
from .commons_benchmark import run as retrieve_pairs
from .contracts import VERSION, digest, validate
from .planning import Model, Reservation
from .providers import PROFILES, retrieve
from .store import Store
from .workflow import initialize


def trace(store, model, expected, stage):
    receipt = store.read(model.last_receipt)
    require(receipt['status'] == 'completed' and receipt['identity']['stage'] == stage and receipt['output'] == expected,
            'Ricevuta non corrispondente al testo pianificato')
    return dict(path=str(store.folder/model.last_receipt), identity_sha256=digest(receipt['identity']),
        output_sha256=digest(expected), requested_model=receipt['identity']['payload']['model'],
        response_model=receipt['response'].get('model'), request_id=receipt['request_id'],
        fixture=receipt['fixture'], stage=stage, usage=receipt['response'].get('usage'),
        reserved_usd=receipt.get('reservation', {}).get('reserved_usd', 0))


def prepare_pilot(folder, cells, model_factory, *, model, run_id, count=2, seed=56, simulated=False, page_size=20):
    require(1 <= len(cells) <= 48 and type(count) is int and 1 <= count <= 5 and type(seed) is int and
            type(page_size) is int and 1 <= page_size <= 20, 'Campione pilota non valido')
    intents = [validate('intent', dict(version=VERSION, taxonomy_version=VERSION,
               **{key: cell[key] for key in ('topic', 'emotion', 'intensity')})) for cell in cells]
    require(len({digest(intent) for intent in intents}) == len(intents), 'Caselle pilota duplicate')
    root = Store(folder)
    with root.lock():
        cfg = dict(version=VERSION, intents=intents, model=model, run_id=run_id, count=count, seed=seed,
                   page_size=page_size, simulated=simulated, provider_profile_sha256=digest(PROFILES['commons']))
        root.save('pilot-config.v1.0.0.json', cfg, immutable=True)
        saved = root.read('model-workload.v1.0.0.json')
        if saved is not None:
            verify_workload(saved)
            return saved
        workload = dict(version='1.1.0', created_at=now(), authorship='Two-stage model client; inspect model_receipts and simulated flag',
            scope='Matched-budget Commons text-query pilot; no approval inferred from hits', query_source='two_stage_model_receipts',
            seed=seed, page_size=page_size, max_pages=1, common_query_suffix='filetype:bitmap', simulated=simulated,
            model_receipts=[], cells=[])
        for index, intent in enumerate(intents):
            store = Store(root.folder/'planning'/f'cell-{index}')
            store.freeze(intent, simulated=simulated, selection_seed=seed)
            with store.lock():
                client = model_factory(store)
                require(client.model == model and client.fixture == simulated, 'Modello/modalità pilota diversi')
                strategies = client.strategies(count=count)
                source = trace(store, client, strategies, 'strategies')
                workload['model_receipts'].append(source)
                cell = dict(id=f'cell-{index}', **{k: intent[k] for k in ('topic', 'emotion', 'intensity')}, queries=[],
                            strategies=strategies, strategy_receipt=source)
                for strategy in strategies['strategies']:
                    variants = client.adapt(strategy, PROFILES['commons'], modes=['text'])
                    adaptation = trace(store, client, variants, 'adaptation')
                    workload['model_receipts'].append(adaptation)
                    query = dict(general=strategy['query'], adapted=variants['variants'][0]['query'],
                                 strategy_id=strategy['id'], adaptation_receipt=adaptation)
                    for arm in ('general', 'adapted'):
                        validate('adaptation', dict(variants=[dict(mode='text', query=query[arm]+' filetype:bitmap', category=None, language='en')]))
                    cell['queries'].append(query)
                workload['cells'].append(cell)
        verify_workload(workload)
        return root.save('model-workload.v1.0.0.json', workload, immutable=True)


def read_trace(reference, stage):
    path = Path(reference['path'])
    store = Store(path.parent.parent)
    receipt = store.read('requests/'+path.name)
    require(receipt is not None and receipt['status'] == 'completed' and receipt['identity']['stage'] == stage,
            'Ricevuta pilota mancante/incompleta')
    require(digest(receipt['identity']) == reference['identity_sha256'] and digest(receipt['output']) == reference['output_sha256'] and
            receipt['fixture'] == reference['fixture'] and receipt['request_id'] == reference['request_id'] and
            receipt['identity']['payload']['model'] == reference['requested_model'] and
            receipt['response'].get('model') == reference['response_model'] and
            receipt['response'].get('usage') == reference['usage'] and reference['stage'] == stage and
            receipt.get('reservation', {}).get('reserved_usd', 0) == reference['reserved_usd'] and
            receipt['output'] == vision_result(receipt['response']), 'Ricevuta pilota alterata')
    return receipt


def verify_workload(workload):
    require(workload.get('query_source') == 'two_stage_model_receipts', 'Origine del piano non verificata')
    references = []
    for cell in workload['cells']:
        receipt = read_trace(cell['strategy_receipt'], 'strategies')
        references.append(cell['strategy_receipt'])
        context = json.loads(receipt['identity']['payload']['input'][0]['content'][0]['text'].split('\n')[-1])
        require(all(context['intent'][key] == cell[key] for key in ('topic', 'emotion', 'intensity')), 'Intenzione diversa dalla ricevuta GPT')
        validate('strategies', receipt['output'])
        require(receipt['fixture'] == workload['simulated'], 'Fixture mescolate a output reali')
        strategies = receipt['output']['strategies']
        require(receipt['output'] == cell['strategies'] and len(strategies) == len(cell['queries']), 'Strategie pilota alterate')
        for strategy, query in zip(strategies, cell['queries']):
            adapted = read_trace(query['adaptation_receipt'], 'adaptation')
            references.append(query['adaptation_receipt'])
            validate('adaptation', adapted['output'])
            require(adapted['fixture'] == workload['simulated'] and query['strategy_id'] == strategy['id'] and
                    query['general'] == strategy['query'] and query['adapted'] == adapted['output']['variants'][0]['query'],
                    'Query diversa dalle ricevute: nessuna attribuzione al modello')
            context = json.loads(adapted['identity']['payload']['input'][0]['content'][0]['text'].split('\n')[-1])
            require(context['strategy'] == strategy and context['provider_profile']['provider'] == 'commons', 'Adattamento associato a strategia/fonte diversa')
    require(references == workload['model_receipts'] and len({r['path'] for r in references}) == len(references), 'Elenco ricevute pilota alterato')
    return True


def evaluate_pilot(folder, workload, retriever=None):
    verify_workload(workload)
    root = Store(folder)
    report = retrieve_pairs(workload, root.folder/'retrieval', retriever=retriever)
    for index, cell in enumerate(workload['cells']):
        intent = dict(version=VERSION, taxonomy_version=VERSION, **{k: cell[k] for k in ('topic', 'emotion', 'intensity')})
        for arm in ('general', 'adapted'):
            store = Store(root.folder/'retrieval'/f'cell-{index}'/arm)
            with store.lock():
                initialize(store, intent, model=workload['model_receipts'][0]['requested_model'], run_id=root.read('pilot-config.v1.0.0.json')['run_id'],
                    providers=['commons'], count=len(cell['queries']), max_calls=len(cell['queries']), page_size=workload['page_size'],
                    seed=workload['seed'], simulated=workload['simulated'])
                store.save('strategies.r1.v1.0.0.json', cell['strategies'], immutable=True)
                queries = [dict(strategy_id=q['strategy_id'], provider='commons', adapted=dict(variants=[dict(mode='text',
                    query=q[arm], category=None, language='en')])) for q in cell['queries']]
                store.save('plan.r1.v1.0.0.json', dict(version=VERSION, baseline=arm == 'general', queries=queries), immutable=True)
                store.save('retrieval-policy.v1.0.0.json', dict(max_calls=len(queries), page_size=workload['page_size'], max_pages=1, commons_bitmap=True), immutable=True)
                store.save('collection.r1.v1.0.0.json', dict(proposed_queries=len(queries), skipped=[]), immutable=True)
    return quality_report(root, workload, report)


def quality_report(root, workload, retrieval_report):
    """Refresh editorial measurements without constructing a model or HTTP client."""
    verify_workload(workload)
    quality = []
    for index, cell in enumerate(workload['cells']):
        for arm in ('general', 'adapted'):
            store = Store(root.folder/'retrieval'/f'cell-{index}'/arm)
            state = store.read('cycle-state.v1.0.0.json') or {}
            quality.append(dict(cell=index, arm=arm, measurements=summarize(store,
                state.get('profile_revision', 1), state.get('document_revision', 1), retrieval_revision=1)))
    result = dict(version=VERSION, simulated=workload['simulated'], planning_requests=len(workload['model_receipts']),
        planning_reserved_usd=sum(r['reserved_usd'] for r in workload['model_receipts']), retrieval=retrieval_report,
        quality=quality, effectiveness_claim=False, published=False)
    root.save('pilot-report.v1.0.0.json', result)
    root.save('pilot-report.'+digest(result)[:20]+'.v1.0.0.json', result, immutable=True)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cells', type=Path, default=Path('data/editorial/commons-benchmark.v1.1.0.json'))
    parser.add_argument('--out', type=Path, default=Path('.pipeline/real-pilot'))
    parser.add_argument('--count', type=int, default=2); parser.add_argument('--seed', type=int, default=56)
    parser.add_argument('--model'); parser.add_argument('--run-id'); parser.add_argument('--base')
    parser.add_argument('--fixture', action='store_true'); parser.add_argument('--execute', action='store_true'); parser.add_argument('--live', action='store_true')
    parser.add_argument('--report-only', action='store_true')
    args = parser.parse_args(argv)
    try:
        if args.report_only:
            root = Store(args.out)
            with root.lock():
                saved = root.read('pilot-report.v1.0.0.json')
                require(saved is not None, 'Rapporto pilota assente')
                result = quality_report(root, root.read('model-workload.v1.0.0.json'), saved['retrieval'])
            print(json.dumps(result)); return 0
        cells = json.loads(args.cells.read_text())['cells']
        if not args.execute and not args.fixture:
            print(json.dumps(dict(network=False, paid_calls=False, cells=len(cells),
                                  planned_model_requests=len(cells)*(1+args.count), execute_required=True))); return 0
        if args.fixture:
            from .fixtures import FixtureAPI, search_client
            model_name = 'fixture-gpt'
            factory = lambda store: Model(store, model_name, FixtureAPI(), fixture=True)
            def fetch(*a, **kw):
                return retrieve(*a, **kw, client=search_client(kw['max_calls']))
        else:
            require(args.model and args.run_id, 'Modello e run ID espliciti richiesti')
            model_name = args.model
            factory = lambda store: Model(store, model_name, reservation=Reservation(args.base,
                os.getenv('REAL_OR_SLOP_ADMIN_TOKEN', ''), args.run_id))
            fetch = None
        workload = prepare_pilot(args.out, cells, factory, model=model_name, run_id=args.run_id or 'fixture-pilot',
                                 count=args.count, seed=args.seed, simulated=args.fixture)
        if args.live or args.fixture:
            result = evaluate_pilot(args.out, workload, fetch)
            print(json.dumps(dict(planning_requests=result['planning_requests'], simulated=result['simulated'],
                                 retrieval=result['retrieval']['summary'], published=False)))
        else:
            print(json.dumps(dict(planning_complete=True, retrieval_live_required=True, published=False)))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(str(error) if isinstance(error, PipelineStop) else 'Pilota interrotto: verificare ricevute e configurazione private')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
