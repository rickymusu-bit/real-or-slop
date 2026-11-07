"""Replayable events: provider/documentary failures never become human votes."""
import json
from pathlib import Path
from ..editorial import now, write_private
from ..v2.protocol import require
from .contracts import digest, validate

DEFAULT_HISTORY = Path(__file__).resolve().parents[2]/'.pipeline/editorial-feedback'


def registry_history(folder=DEFAULT_HISTORY):
    """Read the shared real-cycle history, recovering an interrupted export."""
    from .store import Store
    if not Path(folder).exists():
        return []
    registry = Store(folder)
    with registry.lock():
        events = [registry.read('events/'+path.name) for path in sorted((registry.folder/'events').glob('*.json'))]
        for event in events:
            validate('feedback', event)
        registry.save('history.v1.0.0.json', dict(version='1.0.0', simulated=False, events=events))
    return events


def publish_history(store, folder=DEFAULT_HISTORY):
    """Automatically feed the next cell selection; fixtures never enter this registry."""
    from .store import Store
    if store.frozen()['simulated']:
        return None
    exported = store.read('feedback-export.v1.0.0.json')
    require(exported is not None and exported.get('simulated') is False and exported.get('version') == '1.0.0',
            'Esportazione feedback reale richiesta')
    events = exported['events']
    for event in events:
        validate('feedback', event)
    registry = Store(folder)
    with registry.lock():
        for event in events:
            prior = registry.read('events/'+digest(event['id'])+'.json')
            require(prior is None or prior == event, 'Evento di feedback condiviso incompatibile')
        for event in events:
            registry.save('events/'+digest(event['id'])+'.json', event, immutable=True)
        merged = [registry.read('events/'+path.name) for path in sorted((registry.folder/'events').glob('*.json'))]
        registry.save('history.v1.0.0.json', dict(version='1.0.0', simulated=False, events=merged))
    return str(registry.folder/'history.v1.0.0.json')


def synchronize(store, records=()):
    frozen = store.frozen()
    namespace = digest(frozen)[:16]
    events = []

    def emit(candidate_id, revision, outcome, source, origin='REAL'):
        identity = dict(namespace=namespace, candidate=candidate_id, revision=revision, outcome=outcome, source=source)
        uid = digest(identity)
        event = validate('feedback', dict(id=uid, intent=frozen['intent'], candidate_id=namespace+(':'+origin if origin == 'AI' else '')+':'+digest(candidate_id)[:48],
                                         revision=revision, outcome=outcome))
        path = 'feedback/'+uid+'.json'
        prior = store.read(path)
        store.save(path, dict(event=event, source=source, created_at=prior['created_at'] if prior else now()), immutable=True)
        events.append(event)

    statuses = dict(zero_hits='zero_hits', error='provider_error', uncertain='provider_error',
                    rate_limited='rate_limited', partial='partial')
    for path in sorted((store.folder/'retrieval').glob('*.json')):
        value = store.read('retrieval/'+path.name)
        if value['status'] in statuses:
            emit('query-'+path.stem[:50], value['identity'].get('revision', 1), statuses[value['status']], 'retrieval/'+path.name)
    for row in records:
        for reason in row['blockers']:
            emit(row['id'], 0, reason, 'documentary:'+digest(dict(id=row['id'], proof=row['provenance'])))
        if row.get('duplicate_of'):
            emit(row['id'], 0, 'duplicate', 'pixels:'+row['sha256'])
    for path in sorted((store.folder/'reviews').glob('*.json')):
        row = store.read('reviews/'+path.name)['decision']
        emit(row['candidate_id'], row['revision'], dict(approved='human_approved', rejected='human_rejected', pending='pending')[row['decision']],
             'reviews/'+path.name)
    for path in sorted((store.folder/'site-reviews').glob('*.json')):
        observation = store.read('site-reviews/'+path.name)
        row = observation['event']
        outcome = dict(approved='human_approved', rejected='human_rejected', pending='pending')[row['decision']]
        # Explicit generator/technical/rights refusals remain diagnostic. Only
        # an editorial SLOP refusal contributes to the separate cell prior.
        if row['decision'] == 'rejected':
            try:
                reason = json.loads(row['note']).get('reason', 'editorial')
            except (ValueError, AttributeError):
                reason = 'editorial'
            if reason != 'editorial':
                outcome = 'pending'
        emit('site:'+row['image_id'], row['revision']*2,
             outcome, 'site-reviews/'+path.name, observation['origin'])
    for row in store.read('site-review-current.v1.0.0.json') or []:
        if row['decision'] == 'pending' and row['status'] != 'pending':
            emit('site:'+row['id'], row['revision']*2+1, 'pending', 'presentation:'+row['sha256'], row['origin'])
    # Rebuild from every immutable event, including previously observed failures.
    all_events = [store.read('feedback/'+p.name)['event'] for p in sorted((store.folder/'feedback').glob('*.json'))]
    require(len({e['id'] for e in all_events}) == len(all_events), 'Eventi duplicati incompatibili')
    filename = 'fixture-feedback.v1.0.0.json' if frozen['simulated'] else 'feedback.v1.0.0.json'
    write_private(store.folder/filename, all_events)
    store.save('feedback-export.v1.0.0.json', dict(version='1.0.0', simulated=frozen['simulated'], events=all_events))
    return all_events


def load_history(path):
    value = json.loads(Path(path).read_text())
    if isinstance(value, dict) and 'payload' in value and 'sha256' in value:
        require(digest(value['payload']) == value['sha256'], 'Feedback esportato corrotto')
        value = value['payload']
    if isinstance(value, dict):
        require(value.get('simulated') is False and value.get('version') == '1.0.0', 'Feedback simulato non usabile nello scheduler reale')
        value = value['events']
    require(isinstance(value, list) and not Path(path).name.startswith('fixture-'), 'Storico di feedback reale richiesto')
    for event in value:
        validate('feedback', event)
    return value
