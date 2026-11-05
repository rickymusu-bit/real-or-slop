"""Versioned brief catalogue and small frozen selections. No network or images."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import random
import re
import unicodedata

from ..editorial import write_private, now, PipelineStop
from .briefs import validate as validate_briefs, slop_plan
from .editorial_policy import BACKGROUND_RULE
from .protocol import exact, require, identifier, text, english_text

LEGACY_CATALOG = Path(__file__).resolve().parents[2] / 'data/editorial/briefs.v1.json'
ENGLISH_CATALOG = LEGACY_CATALOG.with_name('briefs.v1.1.0.json')
DEFAULT_CATALOG = ENGLISH_CATALOG
TAG_VOCABULARY = LEGACY_CATALOG.with_name('brief-tags.v1.0.0.json')
FIELDS = ('id', 'medium', 'description', 'slop_prompt', 'search_queries')


def checksum(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def normalized(value):
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())


def brief(row):
    return {key: list(row[key]) if isinstance(row[key], list) else row[key] for key in FIELDS}


def validate_vocabulary(value):
    require(isinstance(value, dict) and value.get('version') == '1.0.0' and value.get('language') == 'en',
            'Vocabolario inglese versionato richiesto')
    tags, aliases, mapping = value.get('tags'), value.get('aliases'), value.get('legacy_to_canonical')
    require(isinstance(tags, dict) and tags and isinstance(aliases, dict) and isinstance(mapping, dict),
            'Tassonomia non valida')
    require(all(isinstance(tag, str) and re.fullmatch(r'[a-z]+(?:_[a-z]+)*', tag) and text(definition, 500)
                for tag, definition in tags.items()), 'Tag canonici snake_case con definizione richiesti')
    require(not set(tags).intersection(mapping) and
            all(isinstance(alias, str) and re.fullmatch(r'[a-z]+(?:_[a-z]+)*', alias) and
                alias not in tags and isinstance(target, str) and target in tags for alias, target in aliases.items()) and
            all(isinstance(target, str) and target in tags for target in mapping.values()),
            'Sinonimo, tag legacy o mappatura non canonici')
    return value


def validate_english(value, vocabulary=None):
    """Add canonical-language checks without changing the historical JSON schema."""
    vocabulary = validate_vocabulary(vocabulary or json.loads(TAG_VOCABULARY.read_text()))
    for row in value['briefs']:
        english_text(row['description']); english_text(row['slop_prompt'])
        require(all(tag in vocabulary['tags'] for tag in row['tags']),
                'Tag sconosciuto, legacy o sinonimo: aggiornare esplicitamente il vocabolario inglese')
    return value


def validate(value):
    exact(value, ('version', 'catalog_id', 'protocol_version', 'authorship', 'briefs'), 'Catalogo brief')
    require(value['version'] in ('1.0.0', '1.1.0') and value['protocol_version'] == '3.0.0' and
            identifier(value['catalog_id']) and text(value['authorship'], 1000), 'Versione o autore catalogo non valido')
    require(isinstance(value['briefs'], list) and 1 <= len(value['briefs']) <= 10000, 'Catalogo vuoto o oltre 10000 brief')
    ids, descriptions, prompts = set(), set(), set()
    for row in value['briefs']:
        exact(row, (*FIELDS, 'revision', 'status', 'tags'), 'Voce catalogo')
        validate_briefs(dict(version='1.0.0', briefs=[brief(row)]))
        require(row['id'] not in ids and normalized(row['description']) not in descriptions and
                normalized(row['slop_prompt']) not in prompts, 'ID, descrizione o prompt duplicato')
        require(type(row['revision']) is int and row['revision'] >= 1 and row['status'] in ('draft', 'approved', 'retired'),
                'Revisione o stato del brief non valido')
        require(isinstance(row['tags'], list) and 1 <= len(row['tags']) <= 8 and len(set(row['tags'])) == len(row['tags']) and
                all(text(tag, 100) for tag in row['tags']), 'Tag non validi')
        require(len(set(normalized(q) for q in row['search_queries'])) == 2, 'Query duplicate')
        ids.add(row['id']); descriptions.add(normalized(row['description'])); prompts.add(normalized(row['slop_prompt']))
    return validate_english(value) if value['version'] == '1.1.0' else value


def select(value, count=5, seed=34, ids=None, exclude=()):
    validate(value)
    require(type(count) is int and 1 <= count <= 25 and type(seed) is int, 'Da 1 a 25 brief per ciclo: massimo 50 immagini')
    lookup = {r['id']: r for r in value['briefs']}
    require(all(uid in lookup for uid in exclude), 'ID da escludere sconosciuto')
    available = [r for r in value['briefs'] if r['status'] != 'retired' and r['id'] not in exclude]
    if ids is not None:
        require(isinstance(ids, list) and 1 <= len(ids) <= 25 and len(set(ids)) == len(ids), 'Selezione esplicita da 1 a 25 ID distinti')
        require(all(uid in {r['id'] for r in available} for uid in ids), 'Brief sconosciuto, ritirato o escluso')
        chosen = [lookup[uid] for uid in ids]
    else:
        require(len(available) >= count, 'Brief disponibili insufficienti')
        # Prefer unseen descriptive tags, without per-topic quotas or model scores.
        rng = random.Random(seed); pool = sorted(available, key=lambda r: r['id']); rng.shuffle(pool)
        chosen, seen = [], set()
        while len(chosen) < count:
            row = max(pool, key=lambda r: len(set(r['tags']) - seen))
            chosen.append(row);seen.update(row['tags']);pool.remove(row)
    return dict(version='1.0.0', briefs=[brief(r) for r in chosen])


def freeze(folder, value, count=5, seed=34, ids=None, exclude=()):
    """Freeze a catalogue selection before REAL search, with no inference call."""
    plan = select(value, count, seed, ids, exclude)
    lookup = {r['id']: r for r in value['briefs']}
    selection = dict(catalog_id=value['catalog_id'], catalog_version=value['version'], catalog_sha256=checksum(value),
        protocol_version='3.0.0', seed=seed, excluded_ids=sorted(exclude),
        selected=[dict(id=r['id'], revision=lookup[r['id']]['revision'], status=lookup[r['id']]['status']) for r in plan['briefs']])
    folder = Path(folder)
    frozen_path = folder/'briefs-frozen.json'
    if frozen_path.exists():
        frozen = json.loads(frozen_path.read_text())
        require(frozen.get('catalog_selection_sha256') == checksum(selection), 'Catalogo o selezione diversi dal ciclo congelato')
        require(checksum(json.loads((folder/'catalog-selection.json').read_text())) == frozen['catalog_selection_sha256'], 'Registro selezione modificato')
        from .briefs import freeze as restore
        class NoInference:
            def request(self, *args):
                raise PipelineStop('Il catalogo non deve chiamare API')
        restored = restore(folder, NoInference(), count=len(plan['briefs']))
        require(restored == plan, 'Brief del ciclo diversi dal catalogo congelato')
        return restored
    instructions = 'Selezione da un catalogo di bozze editoriali originali; nessuna inferenza di ideazione eseguita.\n'+BACKGROUND_RULE
    documents = {'briefs.json': plan, 'slop-plan.json': slop_plan(plan), 'catalog-selection.json': selection,
                 'brief-instructions.json': dict(instructions=instructions)}
    # Never replace a previous LLM plan or a conflicting partial export.
    for name, content in documents.items():
        path = folder/name
        require(not path.exists() or json.loads(path.read_text()) == content, 'Destinazione contiene un altro piano: usare un nuovo ciclo')
    folder.mkdir(parents=True, exist_ok=True)
    for name, content in documents.items():write_private(folder/name, content)
    frozen = dict(frozen_at=now(), briefs_sha256=hashlib.sha256((folder/'briefs.json').read_bytes()).hexdigest(),
        slop_plan_sha256=hashlib.sha256((folder/'slop-plan.json').read_bytes()).hexdigest(),
        instructions_sha256=hashlib.sha256(instructions.encode()).hexdigest(), catalog_selection_sha256=checksum(selection),
        source_inputs_supplied=False, real_search_must_follow_freeze=True, transport='synchronous', ideation_method='authored_catalog')
    write_private(frozen_path, frozen)
    return plan


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=DEFAULT_CATALOG)
    parser.add_argument('--check', action='store_true', help='Validate only; no network')
    parser.add_argument('--english', action='store_true', help='Require canonical English text/tags, including on legacy schema')
    parser.add_argument('--count', type=int, default=5)
    parser.add_argument('--seed', type=int, default=34)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--exclude', nargs='*', default=[])
    parser.add_argument('--out', type=Path, help='Write a small frozen cycle to this private folder')
    args = parser.parse_args(argv)
    try:
        require(not (args.check and args.out), '--check non scrive un ciclo')
        value = validate(json.loads(args.catalog.read_text()))
        if args.english:
            validate_english(value)
        result = dict(catalog_id=value['catalog_id'], version=value['version'], briefs=len(value['briefs']),
            statuses=dict(Counter(r['status'] for r in value['briefs'])),
            tags=dict(Counter(tag for r in value['briefs'] for tag in r['tags'])), network=False, paid=False, generated_images=0)
        if args.out:
            plan = freeze(args.out, value, args.count, args.seed, args.ids, args.exclude)
            result.update(selected_ids=[r['id'] for r in plan['briefs']], selected_briefs=len(plan['briefs']),
                          maximum_candidate_images=2*len(plan['briefs']), output=str(args.out))
        print(json.dumps(result, ensure_ascii=False));return 0
    except (ValueError, OSError, TypeError, KeyError) as error:
        print(str(error) if isinstance(error, PipelineStop) else 'Catalogo o selezione non validi');return 1


if __name__ == '__main__':
    raise SystemExit(main())
