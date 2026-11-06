"""Paired, equal-allowance reports. Unknown judgments are never zero approvals."""
from .contracts import VERSION, digest
from ..v2.protocol import require
from .review import latest_reviews, document_path, profile_path


def summarize(store, revision=1, document_revision=1, retrieval_revision=None):
    retrieval_revision = revision if retrieval_revision is None else retrieval_revision
    policy = store.read('retrieval-policy.v1.0.0.json')
    require(policy is not None, 'Politica retrieval mancante')
    retrieval = [store.read(str(p.relative_to(store.folder))) for p in (store.folder/'retrieval').glob('*.json')]
    documented = store.read(document_path(document_revision))
    profiles = store.read(profile_path(revision, document_revision)) or []
    decisions = latest_reviews(store)
    hashes = {row['id']: row['sha256'] for row in profiles}
    decisions = {uid: row for uid, row in decisions.items() if hashes.get(uid) == row['sha256']}
    approved = [row for row in profiles if decisions.get(row['id'], {}).get('decision') == 'approved' and
                decisions[row['id']]['sha256'] == row['sha256'] and not row['blockers']]
    receipts = [store.read(str(p.relative_to(store.folder))) for p in (store.folder/'requests').glob('*.json')]
    collection = store.read(f'collection.r{retrieval_revision}.v1.0.0.json') or {}
    calls = sum(r['api_calls'] for r in retrieval)
    seen = {(row['provider'], row['source_id']) for run in retrieval for row in run['candidates']}
    judgments = [d for d in decisions.values() if d['decision'] != 'pending']
    by_provider = {}
    for provider in ('commons', 'openverse'):
        provider_rows = [row for row in documented or [] if row['provenance']['provider'] == provider]
        by_provider[provider] = dict(unique_hits=sum(p == provider for p, _ in seen),
            documented=len(provider_rows) if documented is not None else None,
            eligible=sum(not r['blockers'] for r in provider_rows) if documented is not None else None,
            approved=sum(r['provenance']['provider'] == provider for r in approved) if judgments else None)
    return dict(policy=policy, intent=store.frozen()['intent'], strategies=store.read(f'strategies.r{retrieval_revision}.v1.0.0.json'),
        simulated=store.frozen()['simulated'], queries=len(retrieval), proposed_queries=collection.get('proposed_queries'),
        skipped_queries=len(collection.get('skipped', [])), api_calls=calls, unique_hits=len(seen),
        retrieval_statuses={status: sum(r['status'] == status for r in retrieval) for status in
                           ('completed', 'zero_hits', 'partial', 'rate_limited', 'error', 'uncertain')},
        documentary_eligible=sum(not row['blockers'] for row in documented) if documented is not None else None,
        profiled=sum('visual' in row for row in profiles),
        judgment_kind='synthetic_fixture' if store.frozen()['simulated'] else 'human',
        human_judged=0 if store.frozen()['simulated'] else len(judgments), judgments=len(judgments),
        approved=len(approved) if judgments else None, by_provider=by_provider,
        documentary_blockers={reason: sum(reason in row['blockers'] for row in documented) if documented is not None else None
                              for reason in ('license_unresolved', 'origin_unverified')},
        approved_per_api_call=len(approved)/calls if calls and judgments else None,
        reserved_model_usd=sum(r.get('reservation', {}).get('reserved_usd', 0) for r in receipts),
        search_cost_usd=None, duplicates=sum(bool(row.get('duplicate_of')) for row in profiles),
        observed_emotions=sorted({e for row in profiles for e in row.get('visual', {}).get('emotions', [])}),
        observed_intensities=sorted({row['visual']['intensity'] for row in profiles if 'visual' in row}),
        observed_valences=[row['visual']['valence'] for row in profiles if 'visual' in row])


def compare(baseline, adapted):
    a, b = summarize(baseline), summarize(adapted)
    require(a['strategies'] is not None and a['policy'] == b['policy'] and a['intent'] == b['intent'] and a['strategies'] == b['strategies'],
            'Confronto richiede intenzione, strategie e budget identici')
    require(a['simulated'] == b['simulated'], 'Non confrontare fixture e dati reali')
    return dict(version=VERSION, baseline=a, adapted=b, equal_request_allowance=True,
                effective_request_counts_equal=a['api_calls'] == b['api_calls'],
                configuration_sha256=digest(dict(policy=a['policy'], intent=a['intent'], strategies=a['strategies'])),
                effectiveness_claim=False, limitation='Synthetic fixtures only; no real-world efficacy measured.' if a['simulated'] else
                'Descriptive matched-budget comparison; review N, source bias, missing evidence and costs before interpreting yield.')
