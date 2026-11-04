"""Small direct-API pilots sharing a brief, never a REAL image or its caption."""
import json
from pathlib import Path
from .direct import digest
from .protocol import exact, require, text, identifier, generation_plan
from .study import Preparation
from ..editorial import write_private, now

INSTRUCTIONS = '''Crea brief visivi autonomi per un piccolo portfolio REAL/SLOP.
Ogni brief servirà a cercare un'immagine umana esistente e a generarne una sintetica solo da testo.
Non ricevi immagini, fonti, titoli o descrizioni di foto esistenti. Fissa l'intento, senza inventare dettagli da ricercare alla lettera.
Esplora soggetti distinti: un ritratto di una sola persona, un'opera di ingegneria civile,
un soggetto naturale senza persone, un oggetto o architettura, e un dipinto o illustrazione non fotografico.
Questi esempi servono a esplorare la varietà, non sono quote per il catalogo futuro.
Lascia libertà di composizione. Scene semplici e soggetti singoli sono validi. Non chiedere caos, molte persone,
attività umane, difetti fotografici o strategie per sembrare REAL. Non imporre anomalie, bellezza o spettacolarità.
Ogni descrizione deve essere breve e abbastanza ampia da trovare fotografie o opere ben composte già esistenti.
Scrivi description in italiano fino a 35 parole, slop_prompt autonomo in inglese fino a 75 parole, e due search_queries brevi in inglese.
Usa medium photograph oppure artwork; il dipinto/illustrazione deve usare artwork anche nel prompt SLOP.
Nessun URL, nome di persona reale o marchio, nessun artista da imitare, nessun riferimento a una specifica immagine esistente.
Usa esattamente gli ID forniti. Restituisci version 1.0.0 e briefs con id, medium, description, slop_prompt, search_queries.'''


def validate(value):
    exact(value, ('version', 'briefs'), 'Brief condivisi')
    require(value['version'] == '1.0.0' and isinstance(value['briefs'], list) and 1 <= len(value['briefs']) <= 25,
            'Da 1 a 25 brief: massimo 50 immagini finali')
    ids = set()
    for row in value['briefs']:
        exact(row, ('id', 'medium', 'description', 'slop_prompt', 'search_queries'), 'Brief')
        require(identifier(row['id']) not in ids, 'Brief duplicato'); ids.add(row['id'])
        require(row['medium'] in ('photograph', 'artwork') and text(row['description'], 1000) and
                text(row['slop_prompt'], 2000), 'Descrizione o mezzo non valido')
        require(isinstance(row['search_queries'], list) and len(row['search_queries']) == 2 and
                all(text(q, 200) for q in row['search_queries']), 'Due query brevi richieste')
    generation_plan(slop_plan(value))
    return value


def slop_plan(value):
    return dict(version='2.0.0', independent=True, ideas=[dict(id=b['id'], mode='original',
        idea=b['description'], prompt=b['slop_prompt']) for b in value['briefs']])


def freeze(folder: Path, api, count=5):
    require(type(count) is int and 1 <= count <= 25, 'Massimo 25 brief / 50 immagini')
    plan_path, frozen_path = folder/'briefs.json', folder/'briefs-frozen.json'
    if frozen_path.exists():
        frozen = json.loads(frozen_path.read_text())
        require(frozen['briefs_sha256'] == digest(plan_path.read_bytes()) and
                frozen['slop_plan_sha256'] == digest((folder/'slop-plan.json').read_bytes()), 'Brief congelati modificati')
        if frozen.get('instructions_sha256'):
            saved = json.loads((folder/'brief-instructions.json').read_text())
            require(frozen['instructions_sha256'] == digest(saved['instructions'].encode()), 'Istruzioni congelate modificate')
        result = validate(json.loads(plan_path.read_text()))
        require(len(result['briefs']) == count, 'Dimensione del ciclo diversa')
        return result
    ids = ['brief-'+f'{n+1:03}' for n in range(count)]
    properties = dict(id=dict(type='string', enum=ids), medium=dict(type='string', enum=['photograph', 'artwork']),
                      description=dict(type='string'), slop_prompt=dict(type='string'),
                      search_queries=dict(type='array', items=dict(type='string')))
    schema = dict(type='object', additionalProperties=False, required=['version', 'briefs'], properties=dict(
        version=dict(type='string', enum=['1.0.0']), briefs=dict(type='array', items=dict(type='object',
            additionalProperties=False, required=list(properties), properties=properties))))
    instructions = INSTRUCTIONS+'\nNumero richiesto: '+str(count)+'\nID: '+json.dumps(ids)
    result = Preparation(folder, api).call('shared-briefs', instructions, schema, 3000)
    validate(result)
    require({b['id'] for b in result['briefs']} == set(ids), 'ID o numero brief errati')
    write_private(plan_path, result)
    write_private(folder/'slop-plan.json', slop_plan(result))
    write_private(folder/'brief-instructions.json', dict(instructions=instructions))
    write_private(frozen_path, dict(frozen_at=now(), briefs_sha256=digest(plan_path.read_bytes()),
        slop_plan_sha256=digest((folder/'slop-plan.json').read_bytes()), source_inputs_supplied=False,
        real_search_must_follow_freeze=True, transport='synchronous', instructions_sha256=digest(instructions.encode())))
    return result


def pairs(value, candidates):
    """Leave missing or rejected partners incomplete; never fabricate a REAL."""
    validate(value)
    ids = {b['id'] for b in value['briefs']}
    require(all(r.get('brief_id') in ids and r.get('origin') in ('REAL', 'AI') for r in candidates), 'Candidata senza brief o origine valida')
    result = []
    for brief in value['briefs']:
        rows = [r for r in candidates if r.get('brief_id') == brief['id']]
        real = [r['id'] for r in rows if r['origin'] == 'REAL']
        slop = [r['id'] for r in rows if r['origin'] == 'AI']
        require(len(real) <= 1 and len(slop) <= 1, 'Più partner per un brief')
        result.append(dict(brief_id=brief['id'], real=real[0] if real else None, slop=slop[0] if slop else None,
                           complete=bool(real and slop), owner_approval='pending'))
    return result
