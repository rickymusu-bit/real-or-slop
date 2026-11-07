"""Complete owner-reviewed editorial cycle; paid execution is explicitly gated."""
import argparse
import json
import math
import os
import time
from pathlib import Path

from .editorial import PipelineStop, image_payload, image_result, now
from .importer import request, site_url
from .real.contracts import ROOT, TAXONOMY, digest, select, validate
from .real.feedback import load_history, synchronize as feedback
from .real.inbox import CloudflareInbox, export_images, synchronize as sync_inbox
from .real.planning import Model, Reservation
from .real.review import document_path, profile_path, verify_media
from .real.run import plan
from .real.store import Store
from .real.workflow import initialize as initialize_real, advance as advance_real
from .v2.direct import DirectAPI
from .v2.engine import media
from .v2.protocol import require

BRIEF_SCHEMA = json.loads((ROOT/'shared/editorial-cycle.v1.0.0.json').read_text())
CONFIG = 'editorial-config.v1.0.0.json'
FREEZE = 'editorial-freeze.v1.0.0.json'
STATE = 'editorial-state.v1.0.0.json'
BRIEF_INSTRUCTIONS = '''Create one broad editorial photographic brief for the supplied matrix cell.
Return concrete English photographic search strategies derived from that brief, and a bank of diverse,
self-contained text-to-image photographic prompts derived from the SAME brief. Vary scene, viewpoint,
lighting and composition. Do not require famous events or identities. Ordinary scenes are valid.
No existing photograph, search result, URL, title, metadata or image is available or may be requested.
The bank is frozen before retrieval; later owner approvals determine ONLY how many prompts are executed.
Return exactly strategy_count strategies and max_attempts distinct slop_prompts. Each prompt must be
usable by itself, preserve the visible scene context, and describe a fully synthetic photographic scene.'''


def initialize(store, intent, *, model, image_model='', max_attempts=12, generation_usd=0,
               generation_budget_usd=0, quality='medium', author='', license_url=None, **kwargs):
    require(type(max_attempts) is int and 1 <= max_attempts <= 32, 'Da 1 a 32 tentativi congelati')
    require(quality in ('low', 'medium', 'high'), 'Qualità non valida')
    require(all(type(v) in (int, float) and math.isfinite(v) and v >= 0
                for v in (generation_usd, generation_budget_usd)), 'Budget finiti non negativi richiesti')
    require(isinstance(image_model, str) and isinstance(author, str) and len(author) <= 300, 'Modello/autore non validi')
    if license_url is not None:
        from .licenses import recognized_license
        require(recognized_license(license_url) is not None, 'Licenza SLOP non riconosciuta')
    prior = store.read(CONFIG)
    cfg = dict(version='1.0.0', image_model=image_model, max_attempts=max_attempts,
               generation_usd=generation_usd, generation_budget_usd=generation_budget_usd,
               quality=quality, author=author, license_url=license_url)
    require(prior is None or prior == cfg, 'Limiti del ciclo congelati: creare un nuovo run')
    # Never retrofit a shared brief to an already observed photograph.
    require(prior is not None or (not (store.folder/'retrieval').exists() and
            store.read('plan.r1.v1.0.0.json') is None), 'Run REAL già avviato: nuovo ciclo richiesto')
    initialize_real(store, intent, model=model, **kwargs)
    return store.save(CONFIG, cfg, immutable=True)


def freeze_brief(store, model):
    cfg, real = store.read(CONFIG), store.read('cycle-config.v1.0.0.json')
    frozen = store.read(FREEZE)
    if frozen is not None:
        require(frozen['config_sha256'] == digest(cfg) and frozen['intent_sha256'] == digest(store.frozen()) and
                frozen['discovery_config_sha256'] == digest(real),
                'Freeze/configurazione incompatibili')
        validate('brief', frozen['output'], BRIEF_SCHEMA)
        return frozen
    require(not (store.folder/'retrieval').exists(), 'Il brief deve precedere ogni retrieval')
    body = [dict(role='user', content=[dict(type='input_text', text=BRIEF_INSTRUCTIONS+'\n'+json.dumps(dict(
        intent=store.frozen()['intent'], taxonomy=TAXONOMY, strategy_count=real['count'],
        max_attempts=cfg['max_attempts'])))])]
    output = model.invoke('brief', body)
    validate('strategies', output['strategies'])
    require(len(output['strategies']['strategies']) == real['count'] and
            len(output['slop_prompts']) == cfg['max_attempts'], 'Dimensioni del piano diverse dai limiti congelati')
    return store.save(FREEZE, dict(version='1.0.0', output=output, config_sha256=digest(cfg),
        intent_sha256=digest(store.frozen()), discovery_config_sha256=digest(real),
        request_receipt=model.last_receipt, created_at=now()), immutable=True)


def observe(store, report, api):
    """Persist actual site events; a stale pixel vote cannot authorize generation."""
    observed = []
    rows = list(report['images'])
    for deleted in report.get('deleted_images', []):
        require(deleted.get('image_id'), 'Tombstone senza identità del sito')
        rows.append(dict(id=deleted['image_id'], origin=deleted['origin'], sha256=deleted['sha256'],
                         source_sha256=deleted['sha256'], status='rejected', revision=deleted['revision'], deleted=True))
    for row in rows:
        events = api.query('SELECT e.id,e.image_id,e.revision,e.decision,e.image_sha256,e.note,e.created_at,q.sha256 AS effective_sha256,q.revision AS effective_revision,q.status AS effective_status FROM editorial_review_inbox_events e LEFT JOIN editorial_review_effective_images q ON q.id=e.image_id WHERE e.image_id=? ORDER BY e.revision', [row['id']])
        if events and not row.get('deleted'):
            require(events[-1]['effective_sha256'] == row['sha256'] and events[-1]['effective_revision'] == row['revision'] and
                    events[-1]['effective_status'] == row['status'], 'Pixel/voto cambiati durante la sincronizzazione: riprendere')
        events = [{key: event[key] for key in ('id','image_id','revision','decision','image_sha256','note','created_at')} for event in events]
        require((events and events[-1]['revision'] == row['revision'] and events[-1]['decision'] == row['status']) or
                (not events and row['revision'] == 0 and row['status'] == 'pending'), 'Voti cambiati durante la sincronizzazione: riprendere')
        for event in events:
            require(event['image_id'] == row['id'] and event['decision'] in ('approved','rejected','pending') and
                    type(event['revision']) is int and event['revision'] > 0, 'Evento del sito non valido')
            store.save('site-reviews/'+digest(dict(origin=row['origin'], event=event))+'.json',
                       dict(origin=row['origin'], event=event), immutable=True)
        current = dict(row)
        if row.get('deleted') and events:
            current['sha256'] = events[-1]['image_sha256']
        current['decision'] = row['status'] if events and events[-1]['image_sha256'] == current['sha256'] else 'pending'
        current['note'] = events[-1]['note'] if events else ''
        admissions = api.query('SELECT a.cycle_id,a.review_revision,a.image_sha256,EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=a.image_id) AS published FROM editorial_cycle_admissions a WHERE a.inbox_id=? ORDER BY a.review_revision DESC LIMIT 1', [row['id']])
        current['published'] = bool(admissions and admissions[0]['published'])
        current['admitted'] = bool(admissions and admissions[0]['review_revision'] == row['revision'] and
                                   admissions[0]['image_sha256'] == current['sha256'] and current['decision'] == 'approved')
        run = store.read('cycle-config.v1.0.0.json')
        current['allocated_elsewhere'] = bool(admissions and run and admissions[0]['cycle_id'] != run['run_id'])
        observed.append(current)
    return observed


def generation_receipts(store):
    return [store.read('slop-requests/'+p.name) for p in sorted((store.folder/'slop-requests').glob('*.json'))]


def generate(store, slot, *, api=None, reservation=None):
    cfg, frozen = store.read(CONFIG), freeze_brief(store, None)
    require(frozen is not None, 'Brief e banca prompt congelati richiesti')
    require(type(slot) is int and 0 <= slot < cfg['max_attempts'], 'Slot fuori dai limiti')
    body = image_payload(cfg['image_model'], frozen['output']['slop_prompts'][slot],
                         dict(n=1, size='1024x1024', quality=cfg['quality']))
    # This identity/body has no field through which REAL data can enter.
    identity = dict(freeze_sha256=digest(frozen), slot=slot, body=body)
    path = f'slop-requests/{slot:03d}.json'
    saved = store.read(path)
    if saved:
        require(saved['identity'] == identity, 'Prompt o modello modificati dopo il freeze')
        if saved['status'] == 'completed':
            verify_media(store, saved['candidate'])
            return saved['candidate']
        require(saved['status'] in ('prepared', 'received'), 'Generazione incerta/non valida: controllare la ricevuta; nessun reinvio')
    else:
        receipts = generation_receipts(store)
        require(len(receipts) < cfg['max_attempts'] and cfg['generation_usd'] > 0 and
                round((len(receipts)+1)*cfg['generation_usd'], 6) <= cfg['generation_budget_usd'], 'Limite generazioni o budget raggiunto')
        saved = dict(identity=identity, status='prepared', created_at=now())
        store.save(path, saved)
    simulated = store.frozen()['simulated']
    require(simulated or (os.getenv('ENABLE_EDITORIAL_CYCLE_GENERATION') == 'true' and reservation is not None and
            cfg['image_model']), 'Generazione SLOP chiusa: gate, modello e ledger server richiesti')
    if saved['status'] == 'prepared':
        transport = api or DirectAPI(os.getenv('OPENAI_API_KEY',''))
        if not simulated:
            saved.update(status='reserving')
            store.save(path, saved)
            try:
                reserved = reservation.reserve(digest(identity), 'generation', cfg['image_model'])
                require(reserved['reserved_usd'] <= cfg['generation_usd'], 'Stima client inferiore alla prenotazione server')
                saved['reservation'] = reserved
            except (OSError, ValueError, KeyError, TypeError):
                # An acknowledged refusal also remains auditable; no hidden new slot.
                saved.update(status='uncertain')
                store.save(path, saved)
                raise
        saved.update(status='submitting', submitted_at=now())
        store.save(path, saved)
        try:
            response, request_id = transport.request('images/generations', body)
        except (OSError, ValueError, KeyError, TypeError) as error:
            saved.update(status='uncertain', error_type=type(error).__name__, http_status=getattr(error, 'code', None))
            store.save(path, saved)
            raise
        saved.update(status='received', response=response, request_id=request_id, received_at=now())
        store.save(path, saved)  # A crash during conversion can resume without inference.
    try:
        raw = image_result(saved['response'])
        # Preserve valid decoded originals even when technical conversion fails.
        from .batch_engine_io import write_bytes
        write_bytes(store.folder/f'generations/{slot:03d}/provider-original.bin', raw)
        candidate = dict(id=f'slop-{slot:03d}', blockers=[], features=None, review_state='pending',
                         attestation=dict(source_verified=False, rights_verified=False),
                         **media(raw, store.folder, 'generations', f'slot-{slot:03d}'))
        candidate['provenance'] = dict(kind='AI', provider='openai', source_id=saved['request_id'] or f'slot-{slot:03d}',
            source_url='https://platform.openai.com/', license_url=cfg['license_url'], author=cfg['author'],
            input_kind='text-only', fully_synthetic=True, model=cfg['image_model'], prompt=body['prompt'],
            parameters={k: body[k] for k in ('n','size','quality')}, generated_at=saved['received_at'],
            request_id=saved['request_id'], freeze_sha256=digest(frozen), slot=slot,
            evidence='Generazione diretta da prompt congelato; ricevuta e originale privati conservati.')
        saved.update(status='completed', candidate=candidate)
    except (OSError, ValueError, KeyError, TypeError) as error:
        saved.update(status='invalid', error_type=type(error).__name__)
        store.save(path, saved)
        raise
    store.save(path, saved)
    return candidate


def slop_manifest(store, records):
    frozen = store.frozen()
    images = {}
    for row in records:
        verify_media(store, row)
        proof = row['provenance']
        images.setdefault(row['sha256'], dict(id='editorial-slop-'+row['sha256'][:48], origin='AI', sha256=row['sha256'],
            file=str(store.folder/row['derived_file']), original_file=str(store.folder/row['file']),
            pair_key=None, created_at=proof['generated_at'], metadata=dict(title='SLOP · '+row['id'],
                author=proof['author'], source_url=proof['source_url'], license_url=proof['license_url'],
                source_kind='editorial-cycle', source_id=row['id'], cycle_id=store.read('cycle-config.v1.0.0.json')['run_id'],
                intent=frozen['intent'], brief_sha256=digest(store.read(FREEZE)), provenance=proof,
                original_sha256=row['original_sha256'], perceptual_hash=row['perceptual_hash'],
                presentation=row['presentation'], human_rights_confirmed=False)))
    return export_images(store, list(images.values()))


def balance(real, slop):
    real = [r for r in real if not r.get('allocated_elsewhere')]
    slop = [r for r in slop if not r.get('allocated_elsewhere')]
    def counts(rows):
        return {s: sum(r['decision'] == s for r in rows) for s in ('approved','pending','rejected')}
    r, a = counts(real), counts(slop)
    rp = sum(bool(row.get('published')) for row in real)
    ap = sum(bool(row.get('published')) for row in slop)
    ready_real = sum(row['decision'] == 'approved' and bool(row.get('admitted')) and not row.get('published',False) for row in real)
    ready_ai = sum(row['decision'] == 'approved' and bool(row.get('admitted')) and not row.get('published',False) for row in slop)
    return dict(real=r, slop=a, target=r['approved'],
        deficit=max(0, r['approved']-a['approved']-a['pending']),
        approved_per_origin=min(r['approved']-rp, a['approved']-ap),
        publishable_per_origin=min(ready_real,ready_ai),
        published_per_origin=min(rp,ap), published=bool(rp or ap),
        real_waiting=max(0, r['approved']-rp-a['approved']+ap))


def advance(store, *, execute=False, live=False, sync=False, base=None, documents=None,
            document_revision=None, profile_revision=None, model_factory=None, client_factory=None,
            downloader=None, api=None, reservation=None, inbox_api_factory=CloudflareInbox,
            inbox_sync=sync_inbox, real_advance=advance_real, manifest_factory=slop_manifest):
    cfg, rcfg = store.read(CONFIG), store.read('cycle-config.v1.0.0.json')
    require(cfg is not None and rcfg is not None, 'Inizializzare il ciclo editoriale')
    state = dict(version='1.0.0', run_id=rcfg['run_id'], published=False)
    def checkpoint(stage, **data):
        state.update(stage=stage, updated_at=now(), **data)
        return store.save(STATE, state.copy())
    def counts(real, slop):
        state.update(balance(real, slop), attempts=len(generation_receipts(store)),
                     reserved_generation_usd=round(len(generation_receipts(store))*cfg['generation_usd'],6))
        store.save('site-review-current.v1.0.0.json', real+slop)
        feedback(store)
    def model():
        return model_factory(store) if model_factory else Model(store, rcfg['model'], reservation=reservation or
            Reservation(base, os.getenv('REAL_OR_SLOP_ADMIN_TOKEN',''), rcfg['run_id']))
    try:
        frozen = store.read(FREEZE)
        if frozen is None and not execute:
            return checkpoint('awaiting_brief')
        frozen = freeze_brief(store, model() if frozen is None else None)
        if store.read('plan.r1.v1.0.0.json') is None:
            if not execute:
                return checkpoint('awaiting_provider_adaptation')
            plan(store, model(), count=rcfg['count'], providers=rcfg['providers'], strategies=frozen['output']['strategies'])
        real_state = real_advance(store, execute=execute, live=live, documents=documents, base=base,
            sync_inbox=sync, document_revision=document_revision, profile_revision=profile_revision,
            model_factory=model_factory, client_factory=client_factory, downloader=downloader, queue_unverified=True)
        state['discovery'] = real_state
        report = real_state.get('review_inbox')
        if not report or not isinstance(report['images'], list):
            return checkpoint(real_state['stage'])
        if not sync:
            return checkpoint('awaiting_site_sync')  # Never act on a cached owner vote.
        site = inbox_api_factory()
        real = observe(store, report, site)
        # Candidate membership and ORIGINAL SHA are fixed by this cycle's export.
        # Effective SHA must also have a personal vote to count as approved.
        real = [r for r in real if r['origin'] == 'REAL']
        slop = []
        receipts = generation_receipts(store)
        unresolved = [r for r in receipts if r['status'] not in ('completed','prepared','received')]
        outputs = [r['candidate'] for r in receipts if r['status'] == 'completed']
        if outputs:
            ai_report = inbox_sync(store, manifest_factory(store, outputs))
            slop = observe(store, ai_report, site)
        counts(real, slop)
        if unresolved:
            return checkpoint('generation_attention_required')
        # Incomplete receipts are reconciled before allocating new slots.
        resumable = [r for r in receipts if r['status'] in ('prepared','received')]
        for prior in resumable:
            if prior['status'] == 'prepared':
                if not state['deficit']:
                    continue
                if not execute:
                    return checkpoint('awaiting_generation')
                refreshed = inbox_sync(store, real_state['review_inbox_export'])
                real = observe(store, refreshed, site)
                counts(real, slop)
                if not state['deficit']:
                    continue
            outputs.append(generate(store, prior['identity']['slot'], api=api, reservation=reservation or
                (None if rcfg['simulated'] else Reservation(base, os.getenv('REAL_OR_SLOP_ADMIN_TOKEN',''),rcfg['run_id']))))
            slop = observe(store, inbox_sync(store, manifest_factory(store, outputs)), site)
            counts(real, slop)
        # Pending AI occupies capacity. A rejection opens only its missing capacity.
        while state['deficit']:
            receipts = generation_receipts(store)
            if len(receipts) >= cfg['max_attempts'] or cfg['generation_usd'] <= 0 or round((len(receipts)+1)*cfg['generation_usd'],6) > cfg['generation_budget_usd']:
                return checkpoint('generation_limit_reached')
            if not execute:
                return checkpoint('awaiting_generation')
            # Refresh REAL approvals before EVERY paid request, including a long batch.
            refreshed = inbox_sync(store, real_state['review_inbox_export']) if 'review_inbox_export' in real_state else None
            if refreshed is not None:
                real = observe(store, refreshed, site)
                counts(real, slop)
                if not state['deficit']:
                    break
            used = {r['identity']['slot'] for r in receipts}
            slot = next(i for i in range(cfg['max_attempts']) if i not in used)
            outputs.append(generate(store, slot, api=api, reservation=reservation or
                (None if rcfg['simulated'] else Reservation(base,os.getenv('REAL_OR_SLOP_ADMIN_TOKEN',''),rcfg['run_id']))))
            slop = observe(store, inbox_sync(store, manifest_factory(store, outputs)), site)
            counts(real, slop)
        store.save('site-review-current.v1.0.0.json', real+slop)
        feedback(store)
        return checkpoint('awaiting_review' if state['real']['pending'] or state['slop']['pending'] else
                          'awaiting_rights_or_publication' if state['approved_per_origin'] else
                          'completed' if state['published'] and not state['real_waiting'] else 'no_approved_real')
    except (OSError, ValueError, KeyError, TypeError) as error:
        checkpoint('attention_required', error_type=type(error).__name__)
        raise


def admit_and_publish(store, base, admissions=None, publish=False):
    require(not store.frozen()['simulated'], 'Fixture non ammissibili nel catalogo reale')
    token = os.getenv('REAL_OR_SLOP_ADMIN_TOKEN','')
    require(token, 'Token amministratore app richiesto per ammissione/pubblicazione')
    base = site_url(base)
    run_id = store.read('cycle-config.v1.0.0.json')['run_id']
    results = []
    for admission in admissions or []:
        results.append(request(base,token,'/api/admin/editorial/cycle/admit','POST',dict(admission, cycle_id=run_id)))
    result = request(base,token,'/api/admin/editorial/cycle/publish','POST',dict(cycle_id=run_id,confirm=True)) if publish else None
    report = dict(admissions=results,publication=result,checked_at=now())
    store.save('publication-audit.'+digest(report)[:20]+'.v1.0.0.json',report,immutable=True)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['start','resume','status','watch'])
    parser.add_argument('--out',type=Path,default=Path('.pipeline/editorial-cycle'))
    parser.add_argument('--model'); parser.add_argument('--image-model',default=''); parser.add_argument('--run-id')
    parser.add_argument('--topic'); parser.add_argument('--emotion'); parser.add_argument('--intensity')
    parser.add_argument('--seed',type=int,default=56); parser.add_argument('--history',type=Path)
    parser.add_argument('--provider',action='append',choices=['commons','openverse'])
    parser.add_argument('--count',type=int,default=3); parser.add_argument('--maximum',type=int,default=20)
    parser.add_argument('--max-attempts',type=int,default=12); parser.add_argument('--generation-usd',type=float,default=0)
    parser.add_argument('--generation-budget-usd',type=float,default=0); parser.add_argument('--quality',default='medium')
    parser.add_argument('--author',default=''); parser.add_argument('--license-url')
    parser.add_argument('--documents',type=Path); parser.add_argument('--document-revision',type=int); parser.add_argument('--profile-revision',type=int)
    parser.add_argument('--base'); parser.add_argument('--execute',action='store_true'); parser.add_argument('--live',action='store_true')
    parser.add_argument('--sync-inbox',action='store_true'); parser.add_argument('--admissions',type=Path); parser.add_argument('--publish',action='store_true')
    parser.add_argument('--poll-seconds',type=int,default=15); parser.add_argument('--max-polls',type=int,default=120)
    args = parser.parse_args(argv)
    try:
        store = Store(args.out)
        with store.lock():
            if args.action == 'status':
                print(json.dumps(store.read(STATE) or dict(stage='not_started'))); return 0
            if args.action == 'start':
                intent = dict(version='1.0.0',taxonomy_version='1.0.0',topic=args.topic,emotion=args.emotion,intensity=args.intensity) if any((args.topic,args.emotion,args.intensity)) else select(args.seed,load_history(args.history) if args.history else [])[0]
                initialize(store,intent,model=args.model,run_id=args.run_id,providers=args.provider or ['commons'],
                    count=args.count,maximum=args.maximum,image_model=args.image_model,max_attempts=args.max_attempts,
                    generation_usd=args.generation_usd,generation_budget_usd=args.generation_budget_usd,
                    quality=args.quality,author=args.author,license_url=args.license_url,seed=args.seed)
        require(1 <= args.poll_seconds <= 60 and 1 <= args.max_polls <= 10000, 'Attesa da 1 a 60 secondi e numero di poll limitato richiesti')
        polls = args.max_polls if args.action == 'watch' else 1
        for poll in range(polls):
            with store.lock():
                result = advance(store,execute=args.execute,live=args.live,sync=args.sync_inbox,base=args.base,
                    documents=args.documents,document_revision=args.document_revision,profile_revision=args.profile_revision)
                if args.admissions or args.publish:
                    result['catalog'] = admit_and_publish(store,args.base,json.loads(args.admissions.read_text()) if args.admissions else None,args.publish)
            print(json.dumps(result),flush=True)
            if args.action != 'watch' or result['stage'] in ('completed','awaiting_documents','documentary_attention_required',
                    'no_results','provider_attention_required','acquisition_attention_required','generation_limit_reached','generation_attention_required',
                    'attention_required','no_approved_real'):
                return 0
            if poll+1 < polls:
                time.sleep(args.poll_seconds)  # Release the single-writer lock while awaiting owner decisions.
        print(json.dumps(dict(watch_stopped='poll_limit',last_stage=result['stage'])))
        return 0
    except (OSError,ValueError,KeyError,TypeError) as error:
        print(str(error) if isinstance(error,PipelineStop) else 'Ciclo interrotto: controllare ricevute e configurazione private')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
