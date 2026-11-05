"""Versioned contracts shared with the private Worker. No editorial ranking."""
import json
import math
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit
from ..editorial import PipelineStop
from ..licenses import recognized_license

SCHEMA = json.loads((Path(__file__).resolve().parents[2] / 'shared/editorial-v2.json').read_text())
VERSION = SCHEMA['version']


def require(condition, message):
    if not condition:
        raise PipelineStop(message)


def exact(value, keys, name):
    require(isinstance(value, dict) and set(value) == set(keys), name + ': campi mancanti o non ammessi')


def text(value, limit=8000):
    return isinstance(value, str) and 0 < len(value.strip()) <= limit


def english_text(value):
    """Conservative language guard, not a classifier or proof of translation.

    Search queries are exempt: other languages can help discover REAL sources.
    Translation fidelity and new vocabulary still require editorial review.
    """
    require(text(value, 2000), 'Testo canonico inglese richiesto')
    words = set(re.findall(r'[a-z]+', unicodedata.normalize('NFKC', value).casefold()))
    italian = {'un', 'una', 'uno', 'il', 'gli', 'della', 'dello', 'delle', 'degli', 'nel', 'nella',
               'nelle', 'sul', 'sulla', 'con', 'vicino', 'ritratto', 'visibile', 'visibili', 'circostante'}
    english = {'a', 'an', 'the', 'of', 'with', 'and', 'on', 'near', 'beside', 'surrounding', 'visible'}
    require(not words.intersection(italian) and len(words.intersection(english)) >= 2,
            'Descrizione e prompt devono essere in inglese; testo legacy o lingua incerta')


def identifier(value):
    require(isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value), 'Identificativo v2 non valido')
    return value


def https(value):
    if not text(value, 2000):
        return False
    parsed = urlsplit(value)
    return parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password


def strings(value, maximum=20):
    return isinstance(value, list) and len(value) <= maximum and all(text(item, 2000) for item in value)


def visual_profile(value):
    keys = ['version', 'photographic', 'usable', *SCHEMA['enums'], *SCHEMA['scalars'], *SCHEMA['lists']]
    exact(value, keys, 'Profilo visivo')
    require(value['version'] == VERSION and all(type(value[k]) is bool for k in ('photographic', 'usable')), 'Versione o ammissibilità visiva non valida')
    for key, choices in SCHEMA['enums'].items():
        require(value[key] is None or value[key] in choices, 'Attributo visivo non valido: ' + key)
    for key in SCHEMA['scalars']:
        number = value[key]
        require(number is None or (type(number) in (int, float) and math.isfinite(number) and 0 <= number <= 100), 'Misura visiva non valida: ' + key)
    for key in SCHEMA['lists']:
        require(strings(value[key]), 'Osservazioni visive non valide: ' + key)
    require(bool(value['observations']) and bool(value['uncertainties']), 'Servono osservazioni e limiti espliciti della lettura visiva')
    return value


PROFILE_INSTRUCTIONS = '''Descrivi esclusivamente i pixel forniti. Non indovinare l'origine e non giudicare l'autenticità.
Non ricevi fonte, titolo, prompt o etichetta. Non assegnare un punteggio editoriale o una difficoltà.
Ordinarietà, sorpresa e plausibilità sono dimensioni indipendenti; nessuna è una soglia di ammissibilità.
Una fotografia ordinaria, un dettaglio o una texture possono essere pienamente utilizzabili.
usable riguarda soltanto la fruibilità tecnica; photographic descrive il linguaggio visivo, non la provenienza.
Non inventare anomalie o segnali di AI. Riporta osservazioni concrete e ciò che non è determinabile dai pixel.
Rispondi SOLO con un oggetto JSON, senza altri campi, secondo questo contratto: ''' + json.dumps({
    'version': VERSION, 'photographic': True, 'usable': True,
    **{key: [*choices, None] for key, choices in SCHEMA['enums'].items()},
    **{key: 'numero 0–100 oppure null se incerto' for key in SCHEMA['scalars']},
    **{key: ['testo osservabile; lista eventualmente vuota'] for key in SCHEMA['lists']}
}, ensure_ascii=False) + '\nPer ogni attributo enumerato scegli UN valore o null, non una lista. observations e uncertainties non possono essere vuote. language e content sono multi-etichette libere, senza categorie obbligatorie.'


def generation_plan(value):
    exact(value, ('version', 'independent', 'ideas'), 'Piano SLOP autonomo')
    require(value['version'] == VERSION and value['independent'] is True, 'Richiesta ideazione autonoma v2')
    ideas = value['ideas']
    require(isinstance(ideas, list) and 1 <= len(ideas) <= SCHEMA['limits']['candidates'], 'Numero di idee non valido')
    seen = set()
    for idea in ideas:
        exact(idea, ('id', 'mode', 'idea', 'prompt'), 'Idea SLOP')
        uid = identifier(idea['id'])
        require(uid not in seen, 'Idea duplicata')
        seen.add(uid)
        require(idea['mode'] in SCHEMA['modes'] and text(idea['idea']) and text(idea['prompt']), 'Idea o prompt non valido')
        # Structural guarantee: no source, image, URL, input attachment or REAL pool.
        require(not re.search(r'https?://|data:|\b(?:reference_id|source_url|image_url)\b', idea['prompt'], re.I), 'Nessun riferimento o URL nel prompt SLOP')
    return value


def evidence(value):
    require(isinstance(value, list) and 1 <= len(value) <= 20, 'Evidenze documentali richieste')
    ids = set()
    for item in value:
        exact(item, ('id', 'url', 'statement'), 'Evidenza')
        require(identifier(item['id']) not in ids and https(item['url']) and text(item['statement'], 4000), 'Evidenza non valida')
        ids.add(item['id'])
    return ids


def provenance(value, origin):
    """Documentary checks, never inferred from visual characteristics."""
    require(isinstance(value, dict), 'Provenienza: oggetto richiesto')
    common = ('kind', 'content_kind', 'license_url', 'author', 'evidence', 'transformations')
    trace = ('transport', 'request_id') if value.get('transport') == 'synchronous' else ('batch_id', 'custom_id')
    extra = ('provider', 'source_id', 'source_url', 'authenticity', 'semantic_edit') if origin == 'REAL' else ('idea_id', 'mode', 'idea', 'prompt', 'model', 'parameters', 'input_kind', 'fully_synthetic', 'generated_at', 'timestamp_source', *trace)
    exact(value, (*common, *extra), 'Provenienza')
    require(origin in ('REAL', 'AI') and value['kind'] == origin, 'Origine non valida')
    require(value['content_kind'] in ('photograph', 'synthetic', 'artwork', 'unknown'), 'Natura del contenuto non valida')
    require((value['license_url'] is None or recognized_license(value['license_url']) is not None) and text(value['author'], 500), 'Diritti o autore da verificare')
    evidence(value['evidence'])
    require(isinstance(value['transformations'], list) and all(item in SCHEMA['transformations'] for item in value['transformations']), 'Crop, restauro, upscaling o trasformazione non coperta: quarantena')
    if origin == 'REAL':
        require(text(value['provider'], 100) and text(value['source_id'], 300) and https(value['source_url']), 'Fonte REAL incompleta')
        require(value['authenticity'] in ('verified', 'unverified', 'uncertain', 'hybrid') and type(value['semantic_edit']) is bool, 'Verifica REAL incompleta')
    else:
        generation_plan({'version': VERSION, 'independent': True, 'ideas': [{'id': value['idea_id'], **{key: value[key] for key in ('mode', 'idea', 'prompt')}}]})
        require(value['input_kind'] == 'text-only' and value['fully_synthetic'] is True and value['content_kind'] == 'synthetic', 'Solo generazioni integralmente sintetiche da testo')
        require(text(value['model'], 150) and text(value['generated_at'], 100) and all(text(value[key], 150) for key in trace), 'Tracciamento generazione incompleto')
        require(value['timestamp_source'] in ('provider_created', 'retrieved_at'), 'Origine del timestamp richiesta')
        exact(value['parameters'], ('n', 'size', 'quality'), 'Parametri generazione')
        require(type(value['parameters']['n']) is int and value['parameters']['n'] == 1 and value['parameters']['size'] in ('1024x1024', '1024x1536', '1536x1024') and value['parameters']['quality'] in ('low', 'medium', 'high'), 'Parametri non validi')
    return value


def feedback(value, proof_ids):
    exact(value, ('observations', 'misleading_assumptions', 'uncertainty', 'origin_evidence_ids'), 'Feedback')
    require(strings(value['observations']) and strings(value['misleading_assumptions']) and text(value['uncertainty'], 4000), 'Feedback incompleto')
    require(strings(value['origin_evidence_ids']) and bool(value['origin_evidence_ids']) and set(value['origin_evidence_ids']) <= proof_ids, 'Il feedback deve riferire evidenze esistenti')
    return value


def approval_blockers(origin, profile, proof, explanation):
    visual_profile(profile)
    provenance(proof, origin)
    feedback(explanation, evidence(proof['evidence']))
    blockers = []
    if proof['license_url'] is None:
        blockers.append('license_unresolved')
    if not profile['usable'] or not profile['photographic']:
        blockers.append('visual_eligibility')
    if origin == 'REAL' and (proof['authenticity'] != 'verified' or proof['semantic_edit'] or proof['content_kind'] != 'photograph'):
        blockers.append('authenticity_not_verified')
    return blockers
