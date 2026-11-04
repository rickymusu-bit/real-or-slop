"""Reproducible catalogue diagnostics, query yields and unseen-image evaluation.

Fixture runs verify software only. No report authorises publication.
"""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
from .protocol import VERSION, SCHEMA, visual_profile, approval_blockers, require
from ..editorial import PipelineStop, write_private


def wilson(successes, count):
    if not count:
        return None
    z = 1.959963984540054
    p = successes / count
    denominator = 1 + z*z/count
    center = (p + z*z/(2*count))/denominator
    margin = z * math.sqrt(p*(1-p)/count + z*z/(4*count*count))/denominator
    return [round(max(0, center-margin), 6), round(min(1, center+margin), 6)]


def group(row):
    proof = row.get('review', {}).get('provenance', row['provenance'])
    return ('source:' + proof['provider']) if row['origin'] == 'REAL' else ('generator:' + proof['model'])


def visual_distribution(rows, key):
    counts = Counter('unknown' if row['profile'][key] is None else str(row['profile'][key]) for row in rows)
    return dict(sorted(counts.items()))


def variation(a, b):
    na, nb = sum(a.values()), sum(b.values())
    if not na or not nb:
        return None
    return round(sum(abs(a.get(key, 0)/na-b.get(key, 0)/nb) for key in a.keys() | b.keys())/2, 6)


def resize_distribution(rows):
    """Native crop to final-image scale; old whole-frame profiles stay unknown."""
    factors = []
    for row in rows:
        presentation = row.get('presentation', {})
        box = presentation.get('crop_box')
        if presentation.get('version') != '1.1.0' or not isinstance(box, list) or len(box) != 4:
            continue
        side = box[2] - box[0]
        require(side > 0 and box[3]-box[1] == side, 'Dimensioni native del ritaglio non valide')
        factors.append(row['width']/side)
    bins = Counter('downscaled' if f < 1 else 'native_size' if f == 1 else
                   'up_to_2x' if f <= 2 else 'up_to_4x' if f <= 4 else 'over_4x' for f in factors)
    return dict(measured=len(factors), unmeasured=len(rows)-len(factors),
                upscaled=sum(f > 1 for f in factors), scale_bins=dict(bins),
                mean_scale=round(sum(factors)/len(factors), 6) if factors else None,
                maximum_scale=round(max(factors), 6) if factors else None)


def trial_metrics(candidates, trials, heldout_groups):
    """Only first exposures, with a source/model group excluded from training.

    The study supplies anonymous participant IDs and both training and evaluation
    records. Confidence is optional and never becomes an image difficulty label.
    """
    lookup = {row['id']: row for row in candidates}
    trained = defaultdict(set)
    for trial in trials:
        require(trial.get('candidate_id') in lookup and trial.get('phase') in ('training', 'evaluation') and isinstance(trial.get('participant'), str), 'Risposta di studio non valida')
        require(trial.get('choice') in ('REAL', 'AI'), 'Scelta di studio non valida')
        if trial['phase'] == 'training':
            trained[trial['participant']].add(group(lookup[trial['candidate_id']]))
    first, used, per_image = [], set(), defaultdict(list)
    correct, scores = 0, []
    for trial in trials:
        uid, participant = trial['candidate_id'], trial['participant']
        key = (participant, uid)
        if key in used:
            continue
        used.add(key)
        row = lookup[uid]
        valid = trial['phase'] == 'evaluation' and group(row) in heldout_groups and group(row) not in trained[participant]
        if not valid:
            continue
        hit = trial['choice'] == row['origin']
        correct += hit
        first.append(trial)
        per_image[uid].append(hit)
        confidence = trial.get('confidence')
        if confidence is not None:
            require(type(confidence) in (int, float) and math.isfinite(confidence) and 0 <= confidence <= 1, 'Sicurezza soggettiva non valida')
            # Probability of REAL reconstructed from chosen class + confidence.
            p_real = confidence if trial['choice'] == 'REAL' else 1-confidence
            scores.append((p_real-(row['origin'] == 'REAL'))**2)
    return dict(valid_first_exposures=len(first), correct=correct, accuracy=correct/len(first) if first else None,
        accuracy_wilson95=wilson(correct, len(first)), brier_score=sum(scores)/len(scores) if scores else None,
        per_image={uid: dict(n=len(values), error_rate=1-sum(values)/len(values), error_wilson95=wilson(len(values)-sum(values), len(values))) for uid, values in sorted(per_image.items())},
        note='Esposizioni ripetute e gruppi presenti nel training esclusi; nessuna difficoltà preassegnata.')


def report(candidates, queries=(), trials=(), heldout_groups=()):
    require(isinstance(candidates, list) and bool(candidates), 'Servono candidate per il benchmark')
    require(len({row['id'] for row in candidates}) == len(candidates), 'Candidate ripetute nel benchmark')
    by_origin = {origin: [row for row in candidates if row['origin'] == origin] for origin in ('REAL', 'AI')}
    require(sum(map(len, by_origin.values())) == len(candidates), 'Classe benchmark non valida')
    approval_counts, blocked, accepted = Counter(), Counter(), Counter()
    for row in candidates:
        visual_profile(row['profile'])
        review = row.get('review') or {}
        proof, feedback = review.get('provenance', row['provenance']), review.get('feedback', row['feedback'])
        blockers = approval_blockers(row['origin'], row['profile'], proof, feedback)
        for blocker in blockers:
            blocked[blocker] += 1
        state = row.get('review_state', 'quarantine')
        approval_counts[state] += 1
        if state == 'approved' and not blockers and not row['simulated']:
            accepted[row['origin']] += 1
    coverage = {}
    for key in SCHEMA['enums']:
        counts = {origin: visual_distribution(rows, key) for origin, rows in by_origin.items()}
        coverage[key] = dict(counts=counts, total_variation=variation(counts['REAL'], counts['AI']))
    scalar_profiles = {}
    for key in SCHEMA['scalars']:
        scalar_profiles[key] = {}
        for origin, rows in by_origin.items():
            values = [row['profile'][key] for row in rows if row['profile'][key] is not None]
            scalar_profiles[key][origin] = dict(n=len(values), mean=sum(values)/len(values) if values else None,
                bins=dict(Counter(str(min(4, int(value//20))) for value in values)), missing=len(rows)-len(values))
    duplicates, near = [], []
    for i, row in enumerate(candidates):
        for previous in candidates[:i]:
            exact = bool({row['original_sha256'], row['sha256']} & {previous['original_sha256'], previous['sha256']})
            similar = (int(row['perceptual_hash'], 16)^int(previous['perceptual_hash'], 16)).bit_count() <= 5
            if exact:
                duplicates.append([previous['id'], row['id']])
            elif similar:
                near.append([previous['id'], row['id']])
    technical = {}
    for origin, rows in by_origin.items():
        technical[origin] = dict(formats=dict(Counter(row['format'] for row in rows)),
            sizes=dict(Counter(f"{row['width']}x{row['height']}" for row in rows)),
            mean_bytes=sum(row['bytes'] for row in rows)/len(rows) if rows else None,
            resize=resize_distribution(rows))
    yields = []
    for query in queries:
        require(query['channel'] in ('baseline', 'generic', 'vocabulary', 'exploration'), 'Canale query non valido')
        require(type(query['examined']) is int and query['examined'] >= 0 and type(query['new_candidates']) is int and 0 <= query['new_candidates'] <= query['examined'], 'Resa query non valida')
        approved, cost = query.get('approved'), query.get('cost_usd')
        require(approved is None or type(approved) is int and 0 <= approved <= query['new_candidates'], 'Approvazioni query non valide')
        require(cost is None or type(cost) in (int, float) and math.isfinite(cost) and cost >= 0, 'Costo query non valido')
        yields.append({**query, 'cost_per_usable': cost/approved if cost is not None and approved else None})
    comparison = {}
    for channel in ('baseline', 'generic', 'vocabulary', 'exploration'):
        rows = [query for query in queries if query['channel'] == channel]
        comparison[channel] = dict(queries=len(rows), examined=sum(row['examined'] for row in rows),
            cost_usd=sum(row['cost_usd'] for row in rows) if rows and all(row.get('cost_usd') is not None for row in rows) else None)
    matched = len({(row['examined'], row['cost_usd']) for row in comparison.values() if row['queries']}) == 1 and all(row['queries'] for row in comparison.values()) and all(row['cost_usd'] is not None for row in comparison.values())
    fixture = any(row['simulated'] for row in candidates)
    return dict(version=VERSION, data_kind='fixture' if fixture else 'study', sample_size=len(candidates),
        sample_target_met=100 <= len(candidates) <= 200, origins={key: len(rows) for key, rows in by_origin.items()},
        review_states=dict(approval_counts), documentary_blockers=dict(blocked), usable_after_human_review=dict(accepted),
        coverage=coverage, scalar_profiles=scalar_profiles, technical=technical, exact_duplicates=duplicates,
        possible_near_duplicates=near, source_generator_groups=dict(Counter(group(row) for row in candidates)),
        query_yields=yields, query_comparison=comparison, matched_search_budget=matched,
        transfer=trial_metrics(candidates, trials, set(heldout_groups)), publication_ready=False,
        limitations=['Le fixture verificano il software, non la qualità editoriale o il trasferimento formativo.' if fixture else 'Il campione richiede interpretazione e revisione umana.',
                    'Differenze tra classi sono diagnostiche, senza quote obbligatorie o esclusioni automatiche.',
                    'Accuratezza di un classificatore generico non dimostra da sola un bias.',
                    'Servono confronto live a budget comparabile e test umani su fonti e generatori nuovi; nessuna attivazione automatica.'])


def fixture_study(folder, count):
    from .fixtures import study_inputs, FixtureBatch
    from .engine import Config, Engine, initialize
    folder.mkdir(parents=True, exist_ok=True)
    reals, slop = study_inputs(folder / 'inputs', count)
    cfg = Config(evaluator_model='fixture-vision', image_model='fixture-image', run_usd=1000, daily_usd=1000, evaluation_usd=.01, generation_usd=.1)
    candidates = []
    for origin, inputs in [('REAL', reals), ('AI', slop)]:
        state = initialize(origin, inputs, folder / 'inputs', folder / origin, cfg, 'fixture-' + origin, True,
                           dict(url='https://creativecommons.org/publicdomain/zero/1.0/', author='Fixture locale'))
        engine = Engine(state, folder / origin, FixtureBatch())
        for _ in range(10):
            result = engine.tick(execute=True)
            if result['status'] in ('completed', 'paused'):
                break
        require(result['status'] == 'completed', 'Simulazione v2 non completata')
        candidates.extend(state['candidates'])
    return report(candidates)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--states', nargs='+', type=Path)
    parser.add_argument('--queries', type=Path)
    parser.add_argument('--trials', type=Path)
    parser.add_argument('--heldout-groups', nargs='*', default=[])
    parser.add_argument('--fixture-study', type=int)
    parser.add_argument('--out', type=Path, default=Path('artifacts/editorial-v2'))
    args = parser.parse_args(argv)
    try:
        require(bool(args.states) != bool(args.fixture_study), 'Scegliere checkpoint/candidate reali oppure fixture esplicite')
        if args.fixture_study:
            result = fixture_study(args.out, args.fixture_study)
        else:
            candidates = []
            for path in args.states:
                value = json.loads(path.read_text())
                candidates.extend(value['candidates'])
            result = report(candidates, json.loads(args.queries.read_text())['queries'] if args.queries else [],
                            json.loads(args.trials.read_text()) if args.trials else [], args.heldout_groups)
        write_private(args.out / 'report.json', result)
        print(json.dumps({key: result[key] for key in ('version', 'data_kind', 'sample_size', 'origins', 'sample_target_met', 'publication_ready')}))
        return 0
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error) if isinstance(error, PipelineStop) else 'Benchmark v2 interrotto: verificare input e provenienza dei dati')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
