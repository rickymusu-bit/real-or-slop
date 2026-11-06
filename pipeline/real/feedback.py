"""Replayable events: provider/documentary failures never become human votes."""
import json
from pathlib import Path
from ..editorial import now, write_private
from ..v2.protocol import require
from .contracts import digest, validate


def synchronize(store, records=()):
    frozen = store.frozen()
    namespace = digest(frozen)[:16]
    events = []

    def emit(candidate_id, revision, outcome, source):
        identity = dict(namespace=namespace, candidate=candidate_id, revision=revision, outcome=outcome, source=source)
        uid = digest(identity)
        event = validate('feedback', dict(id=uid, intent=frozen['intent'], candidate_id=namespace+':'+digest(candidate_id)[:48],
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
