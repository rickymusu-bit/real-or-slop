"""Small validator for the explicit JSON Schema subset in this contract."""
import hashlib
import json
import math
import random
import re
from pathlib import Path

from ..v2.protocol import require

ROOT = Path(__file__).resolve().parents[2]
VERSION = '1.0.0'
SCHEMA = json.loads((ROOT/'shared/real-discovery.v1.0.0.json').read_text())
TAXONOMY = json.loads((ROOT/'shared/real-discovery-taxonomy.v1.0.0.json').read_text())


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def validate(name, value, schema=None):
    schema = SCHEMA if schema is None else schema
    def check(rule, item):
        if '$ref' in rule:
            rule = schema['$defs'][rule['$ref'].split('/')[-1]]
        types = rule.get('type', [])
        types = [types] if isinstance(types, str) else types
        matches = dict(object=isinstance(item, dict), array=isinstance(item, list),
                       string=isinstance(item, str), boolean=type(item) is bool,
                       integer=type(item) is int,
                       number=type(item) in (int, float) and math.isfinite(item), null=item is None)
        require(not types or any(matches[t] for t in types), 'Tipo non valido: '+name)
        if 'enum' in rule:
            require(item in rule['enum'], 'Valore non ammesso: '+name)
        if isinstance(item, dict):
            props = rule.get('properties', {})
            require(set(rule.get('required', [])) <= set(item), 'Campi mancanti: '+name)
            require(rule.get('additionalProperties', True) or set(item) <= set(props), 'Campi non ammessi: '+name)
            for key, val in item.items():
                if key in props:
                    check(props[key], val)
        elif isinstance(item, list):
            require(rule.get('minItems', 0) <= len(item) <= rule.get('maxItems', 10000), 'Lista non valida: '+name)
            if rule.get('uniqueItems'):
                require(len({digest(x) for x in item}) == len(item), 'Elementi duplicati: '+name)
            for val in item:
                check(rule['items'], val)
        elif isinstance(item, str):
            require(rule.get('minLength', 0) <= len(item) <= rule.get('maxLength', 100000), 'Testo non valido: '+name)
            if rule.get('minLength', 0):
                require(bool(item.strip()), 'Testo vuoto: '+name)
            if 'pattern' in rule:
                require(re.fullmatch(rule['pattern'], item) is not None, 'Formato non valido: '+name)
        elif type(item) in (float, int):
            require(math.isfinite(item) and rule.get('minimum', -math.inf) <= item <= rule.get('maximum', math.inf), 'Numero non valido: '+name)
    check(schema['$defs'][name], value)
    if name == 'intent':
        require(value['emotion'] != 'neutrality' or value['intensity'] == 'low', 'Intensità neutra non significativa')
    if name == 'feedback':
        validate('intent', value['intent'])
    if name == 'strategies':
        require(len({x['id'] for x in value['strategies']}) == len(value['strategies']), 'ID strategie duplicati')
        require(len({x['query'].casefold().strip() for x in value['strategies']}) == len(value['strategies']), 'Query duplicate')
        require(all(not re.search(r'https?://|data:|\bQ[0-9]+\b', x['query']) for x in value['strategies']), 'Strategie con URL/ID non ammessi')
    if name == 'adaptation':
        for row in value['variants']:
            require((row['mode'] == 'category') == (row['category'] is not None), 'Categoria incoerente')
            require(not re.search(r'https?://|data:|\bQ[0-9]+\b', row['query']), 'Query contiene URL/ID non verificato')
    return value


def matrix():
    return [dict(version=VERSION, taxonomy_version=VERSION, topic=t['id'], emotion=e['id'], intensity=i,
                 meaningful=e['id'] != 'neutrality' or i == 'low')
            for t in TAXONOMY['topics'] for e in TAXONOMY['emotions'] for i in TAXONOMY['intensities']]


def select(seed, history=(), count=1):
    """Positive exploration; only final human reviews affect the yield prior."""
    require(type(seed) is int and type(count) is int and 1 <= count <= 48, 'Selezione non valida')
    stats = {}
    seen = {}
    for event in history:
        validate('feedback', event)
        if event['id'] in seen:
            require(seen[event['id']] == event, 'Evento duplicato incompatibile')
            continue
        seen[event['id']] = event
        if event['outcome'] not in ('human_approved', 'human_rejected', 'pending'):
            continue
        key = digest(event['intent'])
        current = stats.setdefault(key, {}).get(event['candidate_id'])
        if current and event['revision'] == current['revision']:
            require(event['outcome'] == current['outcome'], 'Giudizi incompatibili alla stessa revisione')
        if current is None or event['revision'] > current['revision']:
            stats[key][event['candidate_id']] = event
    available = [{k: v for k, v in row.items() if k != 'meaningful'} for row in matrix() if row['meaningful']]
    weights = []
    for row in available:
        events = list(stats.get(digest(row), {}).values())
        real = [e for e in events if ':AI:' not in e['candidate_id']]
        ai = [e for e in events if ':AI:' in e['candidate_id'] and e['outcome'] != 'pending']
        def prior(rows):
            yes = sum(e['outcome'] == 'human_approved' for e in rows)
            no = sum(e['outcome'] == 'human_rejected' for e in rows)
            return (yes + 2) / (yes + no + 4)
        # Separate editorial SLOP yield from REAL retrieval yield. Explicit
        # generator faults never arrive as human refusals in this stream.
        yield_prior = .85*prior(real)+.15*prior(ai) if ai else prior(real)
        weights.append(.25 + .75 * yield_prior)
    rng = random.Random(seed)
    chosen = []
    for _ in range(count):
        index = rng.choices(range(len(available)), weights=weights)[0]
        chosen.append(available.pop(index)); weights.pop(index)
    return chosen
