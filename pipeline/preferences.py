"""Small, auditable preference learner; no training service or paid calls."""
import hashlib
import json
import random
from pathlib import Path

CONFIG = json.loads((Path(__file__).resolve().parent.parent / 'shared/editorial-preferences.json').read_text())
VERSION, EXPLORATION, PRIOR, TAGS = (CONFIG[key] for key in ('version', 'exploration', 'prior', 'tags'))


def model(value=None):
    value = value or {}
    if value.get('version', VERSION) != VERSION or type(value.get('observations', 0)) is not int or value.get('observations', 0) < 0 or not isinstance(value.get('counts', []), list):
        raise ValueError('Snapshot delle preferenze non valido o non compatibile')
    counts = []
    for row in value.get('counts', []):
        if not isinstance(row, dict): continue
        feature = row.get('feature', '')
        if not isinstance(feature, str) or len(feature) > 120 or not feature.startswith(('category:', 'visual:')):
            continue
        if feature.startswith('visual:') and feature[7:] not in TAGS:
            continue
        if any(type(row.get(key)) is not int or not 0 <= row[key] <= 1_000_000_000 for key in ('approved', 'rejected')):
            continue
        counts.append(dict(feature=feature, approved=row['approved'], rejected=row['rejected']))
    return dict(version=VERSION, observations=max(0, int(value.get('observations', 0))), exploration=EXPLORATION,
                counts=sorted(counts, key=lambda row: row['feature']))


def probability(features, state):
    counts = {row['feature']: row for row in model(state)['counts']}
    estimates = [(counts[feature]['approved'] + PRIOR) / (counts[feature]['approved'] + counts[feature]['rejected'] + 2 * PRIOR)
                 if feature in counts else .5 for feature in features]
    return sum(estimates) / len(estimates) if estimates else .5


def order(items, features, state, rng):
    remaining = list(items)
    selected = []
    while remaining:
        explore = rng.random() < EXPLORATION
        weights = [1 if explore else probability(features(item), state) for item in remaining]
        target = rng.random() * sum(weights)
        index = 0
        while index < len(weights) - 1 and target >= weights[index]:
            target -= weights[index]
            index += 1
        selected.append(remaining.pop(index))
    return selected


def creative_hint(state, attempt_id):
    state = model(state)
    mode = 'neutral' if not state['observations'] else 'exploration' if random.Random(attempt_id).random() < EXPLORATION else 'guided'
    ranked = sorted(state['counts'], key=lambda row: (probability([row['feature']], state), row['feature']))
    prefer = [row['feature'] for row in reversed(ranked) if probability([row['feature']], state) > .5][:4] if mode == 'guided' else []
    less = [row['feature'] for row in ranked if probability([row['feature']], state) < .5][:4] if mode == 'guided' else []
    return dict(version=VERSION, observations=state['observations'], exploration=EXPLORATION, mode=mode,
                prefer=prefer, less_often=less, snapshot_sha256=hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest(),
                guidance='Preferenze morbide apprese da approvazioni e rifiuti: non sono divieti, fatti o nuove soglie. Mantieni varietà e libertà espressiva; in esplorazione cerca soluzioni diverse dalle preferenze note.')
