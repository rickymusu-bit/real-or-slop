"""Resumable REAL cycle. Explicit network/model gates, documentary and human waits."""
import argparse
import json
import os
from pathlib import Path

from ..editorial import PipelineStop, now, write_private
from ..v2.protocol import require, identifier
from .acquisition import acquire
from .contracts import VERSION, digest, select, validate
from .feedback import synchronize, load_history
from .gallery import render
from .planning import Model, Reservation
from .providers import PROFILES
from .review import document_path, profile_path, prepare, profile, shortlist, review, latest_reviews, verify_media
from .run import plan, collect
from .store import Store


def initialize(store, intent, *, model, run_id, providers=('commons',), count=5, max_calls=30,
               page_size=20, max_pages=1, download_hosts=('upload.wikimedia.org',), maximum=20,
               seed=56, slop=None, simulated=False):
    validate('intent', intent); identifier(run_id)
    require(isinstance(model, str) and bool(model) and (simulated or model.startswith('gpt-6.1')), 'Modello esplicito richiesto')
    require(providers and len(set(providers)) == len(providers) and all(p in PROFILES for p in providers), 'Provider non validi')
    require(type(count) is int and 1 <= count <= 5 and type(max_calls) is int and 1 <= max_calls <= 2000 and
            type(page_size) is int and 1 <= page_size <= 20 and type(max_pages) is int and 1 <= max_pages <= 3 and
            type(maximum) is int and 1 <= maximum <= 20 and type(seed) is int, 'Limiti ciclo non validi')
    require(download_hosts and all(isinstance(h, str) and h and '/' not in h and ':' not in h for h in download_hosts), 'Host download espliciti richiesti')
    cfg = dict(version=VERSION, model=model, run_id=run_id, providers=list(providers), count=count,
        max_calls=max_calls, page_size=page_size, max_pages=max_pages, download_hosts=list(download_hosts),
        maximum=maximum, seed=seed, simulated=simulated, commons_bitmap=True,
        profiles_sha256=digest({p: PROFILES[p] for p in providers}))
    # Reject incompatible settings before freezing, model construction or network.
    prior = store.read('cycle-config.v1.0.0.json')
    require(prior is None or prior == cfg, 'Configurazione ciclo diversa: nuovo run richiesto')
    store.freeze(intent, slop, simulated, seed)
    return store.save('cycle-config.v1.0.0.json', cfg, immutable=True)


def status(store):
    return store.read('cycle-state.v1.0.0.json') or dict(stage='not_started', published=False)


def handoff(store, records, current):
    require(not store.frozen()['simulated'], 'Fixture non esportabili al flusso reale')
    approved = [row for row in records if current.get(row['id'], {}).get('decision') == 'approved' and
                current[row['id']]['sha256'] == row['sha256']]
    manifest, audit = [], []
    for row in approved:
        verify_media(store, row)
        require(not row['blockers'] and row.get('visual', {}).get('usable') and row['visual']['photographic'] and
                row.get('profile_image_sha256') == row['sha256'], 'Candidata non esportabile')
        manifest.append(dict(id=row['id'], file=str(store.folder/row['file']), provenance=row['provenance']))
        audit.append(dict(id=row['id'], original_sha256=row['original_sha256'], profile_image_sha256=row['sha256'],
                          review=current[row['id']], attestation=row['attestation']))
    key = digest(dict(manifest=manifest, audit=audit))[:20]
    path = store.folder/f'approved-manifest.{key}.v1.0.0.json'
    if manifest:
        write_private(path, manifest)
        store.save(f'handoff.{key}.v1.0.0.json', dict(manifest=str(path), audit=audit, published=False,
            catalog_review_required=True), immutable=True)
    return dict(manifest=str(path) if manifest else None, approved=len(manifest), published=False, catalog_review_required=True)


def advance(store, *, live=False, execute=False, documents=None, decisions=None, document_revision=None,
            profile_revision=None, model_factory=None, client_factory=None, downloader=None, base=None):
    cfg = store.read('cycle-config.v1.0.0.json')
    require(cfg is not None, 'Inizializzare il ciclo prima di riprenderlo')
    require(cfg['profiles_sha256'] == digest({p: PROFILES[p] for p in cfg['providers']}), 'Profili provider cambiati: nuovo run richiesto')
    frozen = store.frozen()
    require(frozen['simulated'] == cfg['simulated'], 'Modalità ciclo incoerente')
    previous = status(store)
    docrev = document_revision or previous.get('document_revision', 1)
    visrev = profile_revision or previous.get('profile_revision', 1)
    require(docrev >= previous.get('document_revision', 1) and visrev >= previous.get('profile_revision', 1), 'Le revisioni non possono retrocedere')
    document_path(docrev); profile_path(visrev, docrev)
    state = dict(version=VERSION, simulated=cfg['simulated'], document_revision=docrev, profile_revision=visrev,
                 model=cfg['model'], providers=cfg['providers'], published=False)

    def checkpoint(stage, **values):
        state.update(stage=stage, updated_at=now(), **values)
        return store.save('cycle-state.v1.0.0.json', state.copy())

    def model():
        if model_factory:
            return model_factory(store)
        require(not cfg['simulated'], 'Per una fixture usare il trasporto esplicito')
        return Model(store, cfg['model'], reservation=Reservation(base, os.getenv('REAL_OR_SLOP_ADMIN_TOKEN', ''), cfg['run_id']))

    try:
        if store.read('plan.r1.v1.0.0.json') is None:
            if not execute:
                return checkpoint('awaiting_query_generation')
            checkpoint('planning')
            plan(store, model(), count=cfg['count'], providers=cfg['providers'])
        if store.read('collection.r1.v1.0.0.json') is None:
            if not live:
                return checkpoint('awaiting_retrieval')
            checkpoint('retrieving')
            collect(store, max_calls=cfg['max_calls'], page_size=cfg['page_size'], max_pages=cfg['max_pages'],
                    client_factory=client_factory, commons_bitmap=cfg['commons_bitmap'])
        sources = [store.read('retrieval/'+p.name) for p in sorted((store.folder/'retrieval').glob('*.json'))]
        hits = {(r['provider'], r['source_id']) for value in sources for r in value['candidates']}
        synchronize(store)
        if not hits:
            return checkpoint('no_results' if all(r['status'] == 'zero_hits' for r in sources) else 'provider_attention_required',
                              retrieved=0, gallery=render(store))
        state['retrieved'] = len(hits)
        records = store.read(document_path(docrev))
        if documents is not None:
            checkpoint('validating_documents')
            records = prepare(store, json.loads(Path(documents).read_text()), Path(documents).resolve().parent, docrev)
        if records is None:
            if store.read('documentary-template.r1.v1.0.0.json') is None:
                if not live:
                    return checkpoint('awaiting_acquisition', gallery=render(store))
                checkpoint('acquiring')
                kwargs = dict(downloader=downloader) if downloader else {}
                acquired = acquire(store, cfg['download_hosts'], 'RealOrSlop/1.0 (https://github.com/rickymusu-bit/real-or-slop)',
                                   maximum=cfg['maximum'], **kwargs)
                state['acquired'] = len(acquired['records'])
            state['acquired'] = len(store.read('documentary-template.r1.v1.0.0.json') or [])
            return checkpoint('awaiting_documents', documentary_input=str(store.folder/'documentary-input.r1.v1.0.0.json'),
                              gallery=render(store))
        synchronize(store, records)
        state['documentary_eligible'] = sum(not row['blockers'] and not row.get('duplicate_of') for row in records)
        if not state['documentary_eligible']:
            return checkpoint('documentary_attention_required', gallery=render(store, records))
        profiles = store.read(profile_path(visrev, docrev))
        if profiles is None:
            if not execute:
                return checkpoint('awaiting_visual_profile', gallery=render(store, records))
            checkpoint('profiling')
            profiles = profile(store, model(), visrev, docrev)
        selection = shortlist(profiles)
        selection_path = profile_path(visrev, docrev).replace('profiled.', 'shortlist.')
        store.save(selection_path, selection, immutable=True)
        if decisions is not None:
            review(store, profiles, json.loads(Path(decisions).read_text()))
        feedback = synchronize(store, profiles)
        current = latest_reviews(store)
        current = {row['id']: current[row['id']] for row in profiles if row['id'] in current and current[row['id']]['sha256'] == row['sha256']}
        state.update(profiled=sum('visual' in row for row in profiles), shortlist=selection['shortlisted'],
            reviewed=sum(d['decision'] != 'pending' for d in current.values()),
            approved=sum(d['decision'] == 'approved' for d in current.values()), feedback_events=len(feedback),
            feedback=str(store.folder/'feedback-export.v1.0.0.json'), gallery=render(store, profiles, selection['shortlisted']))
        if not cfg['simulated']:
            state['handoff'] = handoff(store, profiles, current)
        pending = any(current.get(uid, {}).get('decision') not in ('approved', 'rejected') for uid in selection['shortlisted'])
        return checkpoint('awaiting_review' if pending else 'completed' if selection['shortlisted'] else 'no_usable_candidates')
    except (OSError, ValueError, KeyError, TypeError) as error:
        checkpoint('attention_required', interrupted_stage=state.get('stage'), error_type=type(error).__name__)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'resume', 'status'])
    parser.add_argument('--out', type=Path, default=Path('.pipeline/real-cycle'))
    parser.add_argument('--model'); parser.add_argument('--run-id'); parser.add_argument('--base')
    parser.add_argument('--topic'); parser.add_argument('--emotion'); parser.add_argument('--intensity')
    parser.add_argument('--seed', type=int, default=56); parser.add_argument('--history', type=Path)
    parser.add_argument('--provider', action='append', choices=list(PROFILES))
    parser.add_argument('--count', type=int, default=5); parser.add_argument('--max-calls', type=int, default=30)
    parser.add_argument('--page-size', type=int, default=20); parser.add_argument('--max-pages', type=int, default=1)
    parser.add_argument('--download-host', action='append'); parser.add_argument('--maximum', type=int, default=20)
    parser.add_argument('--slop-plan', type=Path); parser.add_argument('--documents', type=Path); parser.add_argument('--reviews', type=Path)
    parser.add_argument('--document-revision', type=int); parser.add_argument('--profile-revision', type=int)
    parser.add_argument('--execute', action='store_true'); parser.add_argument('--live', action='store_true')
    args = parser.parse_args(argv)
    try:
        store = Store(args.out)
        with store.lock():
            if args.action == 'status':
                print(json.dumps(status(store))); return 0
            if args.action == 'start':
                if any((args.topic, args.emotion, args.intensity)):
                    intent = dict(version=VERSION, taxonomy_version=VERSION, topic=args.topic, emotion=args.emotion, intensity=args.intensity)
                else:
                    intent = select(args.seed, load_history(args.history) if args.history else [])[0]
                initialize(store, intent, model=args.model, run_id=args.run_id, providers=args.provider or ['commons'],
                    count=args.count, max_calls=args.max_calls, page_size=args.page_size, max_pages=args.max_pages,
                    download_hosts=args.download_host or ['upload.wikimedia.org'], maximum=args.maximum, seed=args.seed,
                    slop=json.loads(args.slop_plan.read_text()) if args.slop_plan else None)
            result = advance(store, live=args.live, execute=args.execute, documents=args.documents, decisions=args.reviews,
                document_revision=args.document_revision, profile_revision=args.profile_revision, base=args.base)
        print(json.dumps(result)); return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(str(error) if isinstance(error, PipelineStop) else 'Ciclo interrotto: controllare configurazione e ricevute private')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
