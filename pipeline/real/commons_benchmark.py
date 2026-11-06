"""Paired live Commons retrieval, from a preregistered manual or model plan.

No model calls, implicit retries, downloads, approvals or publication. This
measures retrieval and documentary hints, not verified editorial yield.
"""
import argparse
import copy
import json
import random
from pathlib import Path

from ..editorial import now, PipelineStop
from ..licenses import recognized_license
from ..v2.protocol import require
from .contracts import VERSION, digest, validate
from .providers import retrieve
from .store import Store

UA = 'RealOrSlop/1.0 (https://github.com/rickymusu-bit/real-or-slop)'


def public_report(report):
    """Publish aggregate measurements while source dossiers stay private."""
    output = copy.deepcopy(report)
    for pair in output['pairs']:
        for arm in ('general', 'adapted'):
            for key in ('source_ids', 'source_pages'):
                pair[arm].pop(key, None)
    output['source_fields_omitted'] = True
    output['private_source_receipts_preserved'] = True
    return output


def run(workload, folder, retriever=None):
    require(workload['version'] in (VERSION, '1.1.0') and workload['max_pages'] == 1 and
            1 <= workload['page_size'] <= 20 and 1 <= len(workload['cells']) <= 48, 'Piano benchmark non valido')
    suffix = workload.get('common_query_suffix', '')
    simulated = workload.get('simulated', False)
    require(type(simulated) is bool, 'Modalità benchmark non valida')
    retriever = retrieve if retriever is None else retriever
    require(suffix in ('', 'filetype:bitmap'), 'Filtro Commons non verificato')
    for cell in workload['cells']:
        validate('intent', dict(version=VERSION, taxonomy_version=VERSION,
                **{key: cell[key] for key in ('topic', 'emotion', 'intensity')}))
        require(1 <= len(cell['queries']) <= 5, 'Da una a cinque strategie per intenzione')
        for query in cell['queries']:
            for arm in ('general', 'adapted'):
                validate('adaptation', dict(variants=[dict(mode='text', query=query[arm]+(' '+suffix if suffix else ''), category=None, language='en')]))
    study = Store(folder)
    with study.lock():
        study.save('preregistered.v1.0.0.json', workload, immutable=True)
        rng = random.Random(workload['seed'])
        pairs, ordering, identities = [], [], dict(general=set(), adapted=set())
        counted_receipts = dict(general=set(), adapted=set())
        for cell_index, cell in enumerate(workload['cells']):
            intent = validate('intent', dict(version=VERSION, taxonomy_version=VERSION,
                **{key: cell[key] for key in ('topic', 'emotion', 'intensity')}))
            require(1 <= len(cell['queries']) <= 5, 'Da una a cinque strategie per intenzione')
            stores = {}
            for arm in ('general', 'adapted'):
                stores[arm] = Store(study.folder/f'cell-{cell_index}'/arm)
                stores[arm].freeze(intent, selection_seed=workload['seed'], simulated=simulated)
            for query_index, query in enumerate(cell['queries']):
                order = ['general', 'adapted']
                rng.shuffle(order)
                ordering.append(dict(cell=cell_index, query=query_index, order=order))
                arms = {}
                for arm in order:
                    compiled = query[arm]+(' '+suffix if suffix else '')
                    adapted = validate('adaptation', dict(variants=[dict(mode='text', query=compiled, category=None, language='en')]))
                    with stores[arm].lock():
                        result = retriever(stores[arm], 'commons', adapted, UA, max_calls=len(cell['queries']),
                                          page_size=workload['page_size'], max_pages=1)
                    require(result['status'] in ('completed', 'zero_hits'),
                            'Commons non pronto: benchmark fermato, ricevuta conservata; nessun retry implicito')
                    rows = result['candidates']
                    for row in rows:
                        identities[arm].add(row['source_id'])
                    metadata_licenses = sum(recognized_license(row['rights']) is not None for row in rows)
                    media_skipped = sum(log.get('unsupported_media', 0) for log in result['variant_logs'])
                    receipt_key = digest(result['identity'])
                    cached = receipt_key in counted_receipts[arm]
                    counted_receipts[arm].add(receipt_key)
                    arms[arm] = dict(query=query[arm], compiled_query=compiled, status=result['status'], api_calls=0 if cached else result['api_calls'],
                        returned=len(rows), recognized_license_metadata=metadata_licenses,
                        unsupported_media=media_skipped, elapsed_seconds=result['elapsed_seconds'],
                        source_ids=[row['source_id'] for row in rows],
                        source_pages=[row['source_url'] for row in rows])
                    if cached:
                        arms[arm]['query_cache_reused'] = True
                    print(json.dumps(dict(cell=cell_index, pair=query_index, arm=arm, status=result['status'], returned=len(rows))), flush=True)
                pairs.append(dict(cell=cell_index, pair=query_index, intent=intent, **arms))
        summary = {}
        for arm in ('general', 'adapted'):
            rows = [pair[arm] for pair in pairs]
            summary[arm] = dict(queries=len(rows), api_calls=sum(row['api_calls'] for row in rows),
                returned_records=sum(row['returned'] for row in rows), unique_source_ids=len(identities[arm]),
                zero_hit_queries=sum(row['status'] == 'zero_hits' for row in rows),
                failed_queries=sum(row['status'] in ('error', 'rate_limited', 'uncertain') for row in rows),
                recognized_license_records=sum(row['recognized_license_metadata'] for row in rows),
                unsupported_media=sum(row['unsupported_media'] for row in rows),
                documentary_verified=None, visually_evaluated=None, human_approved=None, approved_yield=None)
        prior = study.read('report.v1.0.0.json')
        report = dict(version=VERSION, created_at=prior['created_at'] if prior else now(), provider='commons',
            authorship=workload['authorship'], preregistered_sha256=digest(workload), seed=workload['seed'],
            page_size=workload['page_size'], max_pages=1, common_query_suffix=suffix, ordering=ordering, pairs=pairs, summary=summary,
            common_source_ids=len(identities['general'] & identities['adapted']),
            paid_calls=False, images_downloaded=0, publication=False, effectiveness_claim=False,
            limitations=['One bounded page per query; returned records are not total indexed hits.',
                'Recognized license metadata is not verified rights or photographic authenticity.',
                'No visual or human judgment; approved editorial yield remains unknown.',
                'This control tests text queries; GPT effectiveness requires model-authored query receipts.'])
        if simulated:
            report['simulated'] = True
        if workload.get('query_source') == 'two_stage_model_receipts':
            report['model_trace_required'] = True
            report['limitations'][-1] = 'Model-generated text-query comparison; editorial effectiveness still requires verified images and human judgments.'
        return study.save('report.v1.0.0.json', report, immutable=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, default=Path('data/editorial/commons-benchmark.v1.1.0.json'))
    parser.add_argument('--out', type=Path, default=Path('.pipeline/commons-benchmark/v1.1.0'))
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args(argv)
    workload = json.loads(args.plan.read_text())
    if not args.live:
        print(json.dumps(dict(network=False, model_calls=False, intended_search_calls=2*sum(len(c['queries']) for c in workload['cells']))))
        return 0
    try:
        report = run(workload, args.out)
    except PipelineStop as error:
        print(json.dumps(dict(status='stopped', reason=str(error), paid_calls=False)))
        return 2
    print(json.dumps(report['summary']))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
