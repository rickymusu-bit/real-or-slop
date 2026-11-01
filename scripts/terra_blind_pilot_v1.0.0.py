"""Experimental blind evaluator; consumes locally prepared, quarantined candidates.

This is not a collector, authenticity checker, selection system, or uploader.
No request is sent without --execute and a fresh output path.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

MODEL = 'gpt-6.1-terra'
PROMPT_VERSION = '1.0.0'
MAX_OUTPUT = 3000
BUDGET = 1.0
IN_RATE, OUT_RATE = 1.0, 5.0  # USD per million tokens, standard tier, 2026-11-01
PROMPT = '''Sei curatore di Real or Slop. Valuta solo il valore ludico di questa immagine, senza determinare se sia reale o generata. Potrebbe essere straordinaria, controintuitiva, ingannevole o improbabile? Descrivi solo ciò che vedi; non inventare anomalie. Antichità, sfocatura, colori saturi, bassa risoluzione, complessità e oggetti comuni non bastano. Valuta 0–5 dubbio concreto, sorpresa visibile, plausibilità interna e leggibilità su smartphone. Se manca un dettaglio concreto, dubbio deve essere 0 o 1. Indica osservazione neutra, dettaglio preciso, meccanismo cognitivo, incertezze e se manca un motivo significativo di selezione. Rispondi in italiano secondo lo schema. Non calcolare punteggi.'''
FIELDS = ['osservazione_visiva', 'dettaglio_di_dubbio', 'meccanismo_cognitivo', 'incertezze']
METRICS = ['dubbio', 'sorpresa', 'plausibilita', 'leggibilita']
SCHEMA = {'type': 'object', 'properties': {**{k: {'type': 'string'} for k in FIELDS}, **{k: {'type': 'integer', 'minimum': 0, 'maximum': 5} for k in METRICS}, 'motivo_significativo_assente': {'type': 'boolean'}}, 'required': FIELDS + METRICS + ['motivo_significativo_assente'], 'additionalProperties': False}


def validate(value):
    if not isinstance(value, dict) or set(value) != set(SCHEMA['required']):
        raise ValueError('Schema di risposta non valido')
    if any(not isinstance(value[k], str) for k in FIELDS):
        raise ValueError('Campi testuali non validi')
    if any(type(value[k]) is not int or not 0 <= value[k] <= 5 for k in METRICS):
        raise ValueError('Punteggi non validi')
    if type(value['motivo_significativo_assente']) is not bool:
        raise ValueError('Indicatore non valido')
    if (not value['dettaglio_di_dubbio'].strip() or value['motivo_significativo_assente']) and value['dubbio'] > 1:
        raise ValueError('Dubbio incoerente con motivo assente')
    return 8 * value['dubbio'] + 5 * value['sorpresa'] + 3 * value['plausibilita'] + 4 * value['leggibilita']


def post(endpoint, payload, key):
    req = Request('https://api.openai.com/v1/' + endpoint, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key}, method='POST')
    with urlopen(req, timeout=120) as response:
        return json.load(response)


def payload_for(path):
    raw = path.read_bytes()
    if len(raw) > 15_000_000:
        raise ValueError('File troppo grande per questo esperimento')
    if raw.startswith(b'\xff\xd8\xff'): mime = 'image/jpeg'
    elif raw.startswith(b'\x89PNG\r\n\x1a\n'): mime = 'image/png'
    elif raw[:4] == b'RIFF' and raw[8:12] == b'WEBP': mime = 'image/webp'
    else: raise ValueError('Formato non supportato')
    data = base64.b64encode(raw).decode('ascii')
    return raw, {'model': MODEL, 'instructions': PROMPT, 'input': [{'role': 'user', 'content': [{'type': 'input_image', 'image_url': 'data:' + mime + ';base64,' + data, 'detail': 'high'}]}], 'text': {'format': {'type': 'json_schema', 'name': 'editorial_review', 'strict': True, 'schema': SCHEMA}}, 'reasoning': {'effort': 'high'}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path, help='JSON array; ogni riga richiede file, source_id e provider')
    parser.add_argument('--out', type=Path, required=True, help='nuovo file privato JSONL; nessuna ripresa automatica')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    rows = json.loads(args.manifest.read_text(encoding='utf-8'))
    if not isinstance(rows, list) or not 1 <= len(rows) <= 50:
        raise ValueError('Il lotto deve contenere da 1 a 50 fotografie')
    if args.out.exists(): raise ValueError('Output già esistente: evitare richieste duplicate')
    if not args.execute:
        print('Piano locale: %d candidate; nessuna richiesta. Verificare fonti, diritti, controlli ordinari e duplicati prima di --execute.' % len(rows))
        return
    key = os.environ.get('OPENAI_API_KEY')
    if not key: raise SystemExit('OPENAI_API_KEY non disponibile; nessuna richiesta inviata.')
    total = 0.0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x', encoding='utf-8') as log:
        def write(row):
            log.write(json.dumps(row, ensure_ascii=False) + '\n'); log.flush(); os.fsync(log.fileno())
        for row in rows:
            if not all(row.get(k) for k in ('file', 'source_id', 'provider')):
                raise ValueError('Metadati minimi mancanti; lotto interrotto')
            path = (args.manifest.parent / row['file']).resolve()
            raw, request = payload_for(path)
            count_request = {k: request[k] for k in ('model', 'instructions', 'input', 'text')}
            count = post('responses/input_tokens', count_request, key)['input_tokens']
            worst = (count * IN_RATE + MAX_OUTPUT * OUT_RATE) / 1_000_000
            if total + worst > BUDGET:
                write({'status': 'budget_stop', 'spent_estimate_usd': total, 'next_worst_case_usd': worst})
                break
            record = {'provider': row['provider'], 'source_id': row['source_id'], 'sha256': hashlib.sha256(raw).hexdigest(), 'model': MODEL, 'prompt_version': PROMPT_VERSION, 'timestamp': datetime.now(timezone.utc).isoformat(), 'status': 'request_started', 'decision': 'candidate_non_approvata', 'input_tokens_preflight': count}
            write(record)
            try:
                result = post('responses', {**request, 'max_output_tokens': MAX_OUTPUT, 'store': False, 'service_tier': 'default'}, key)
                usage = result['usage']
                cost = (usage['input_tokens'] * IN_RATE + usage['output_tokens'] * OUT_RATE) / 1_000_000
                total += cost
                record.update(status='received', usage=usage, estimated_cost_usd=cost, cumulative_estimated_cost_usd=total, response_id=result.get('id'), model_returned=result.get('model'))
                write(record.copy())  # preserve billing even if output is invalid
                texts = [c['text'] for item in result.get('output', []) for c in item.get('content', []) if c.get('type') == 'output_text']
                if result.get('status') != 'completed' or len(texts) != 1: raise ValueError('Risposta incompleta o rifiutata')
                evaluation = json.loads(texts[0]); score = validate(evaluation)
                record.update(status='evaluated', evaluation=evaluation, score=score)
                write(record)
                if total > BUDGET: raise ValueError('Stima del budget superata; elaborazione interrotta')
            except Exception:
                write({**record, 'status': 'interrupted', 'reason': 'Errore o risultato non valido; nessun retry automatico'})
                raise


if __name__ == '__main__':
    main()
