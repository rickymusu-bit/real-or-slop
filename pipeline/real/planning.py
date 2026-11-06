"""Two independent structured GPT stages; bounded, hash-bound direct requests."""
import copy
import json
import os

from ..editorial import now, vision_result
from ..importer import request
from ..v2.direct import DirectAPI
from ..v2.protocol import require
from .contracts import SCHEMA, TAXONOMY, digest, validate

STRATEGY_INSTRUCTIONS = '''Propose diverse short English photographic search hypotheses for the supplied intent.
Use concrete visible situations, ordinary as well as salient. Do not use abstract emotion keywords as queries.
The intent is exploratory, not an asserted property of a result. Never invent events or identities.
For recent news prefer the previous calendar year as a search suggestion, not an exclusion rule.
Do not produce SLOP prompts or descriptions of existing photographs. Return only the structured strategies.'''
ADAPT_INSTRUCTIONS = '''Adapt this general photographic search strategy to the supplied versioned provider profile.
Return short provider-specific variants and a language. Use only supported modes.
For Commons a proposed Category: name must be verified by code before use; always provide a textual fallback query.
Do not invent HTTP parameters, URLs, Wikidata IDs, category IDs or filters.
Openverse needs broader vocabulary and separate code-controlled license filters.
Return only structured variants; a query is a hypothesis, never a guarantee of origin or interest.'''


class Reservation:
    def __init__(self, base, token, run_id):
        require(bool(base) and bool(token), 'Ledger server e token admin richiesti')
        self.base, self.token, self.run_id = base, token, run_id

    def reserve(self, fingerprint, stage, model):
        result = request(self.base, self.token, '/api/admin/editorial/real-discovery/reserve', 'POST',
                         dict(run_id=self.run_id, fingerprint=fingerprint, stage=stage, model=model))
        require(result.get('reserved_usd', 0) > 0, 'Prenotazione server mancante')
        require(result.get('already_reserved') is False, 'Prenotazione già usata/incerta: nessun reinvio automatico')
        return result


class Model:
    def __init__(self, store, model, api=None, reservation=None, fixture=False):
        require(store.frozen()['simulated'] == fixture, 'Non mescolare fixture e run reali')
        require(fixture or (model.startswith('gpt-6.1') and os.getenv('ENABLE_REAL_DISCOVERY_PAID') == 'true'
                            and reservation is not None), 'Modello GPT-6.1, gate esplicito e ledger server richiesti')
        self.store, self.model, self.reservation, self.fixture = store, model, reservation, fixture
        self.api = api or DirectAPI(os.getenv('OPENAI_API_KEY', ''))

    def invoke(self, stage, body, revision=1):
        require(stage in ('strategies', 'adaptation', 'visual') and type(revision) is int and revision > 0, 'Revisione/stadio non validi')
        frozen = self.store.frozen()
        schema = copy.deepcopy(SCHEMA['$defs'][stage])
        # Output shapes are self-contained. Do not send unrelated receipt/profile
        # definitions, or keywords outside the Responses strict schema subset.
        def strict_subset(rule):
            if isinstance(rule, dict):
                rule.pop('uniqueItems', None)  # Enforced by our deterministic validator.
                for value in rule.values():
                    strict_subset(value)
            elif isinstance(rule, list):
                for value in rule:
                    strict_subset(value)
        strict_subset(schema)
        payload = dict(model=self.model, store=False, max_output_tokens=4000,
                       text=dict(format=dict(type='json_schema', name='real_'+stage, strict=True, schema=schema)),
                       input=body)
        identity = dict(freeze_sha256=digest(frozen), revision=revision, stage=stage, payload=payload)
        fingerprint = digest(identity)
        path = 'requests/'+fingerprint+'.json'
        saved = self.store.read(path)
        if saved:
            if saved['status'] == 'completed':
                return validate(stage, saved['output'])
            require(saved['status'] == 'prepared', 'Invio precedente incerto/non valido: verificare ricevuta; nuova revisione esplicita richiesta')
        else:
            saved = dict(identity=identity, status='prepared', created_at=now(), fixture=self.fixture)
            self.store.save(path, saved)
        if not self.fixture:
            saved['reservation'] = self.reservation.reserve(fingerprint, stage, self.model)
        saved.update(status='submitting', submitted_at=now())
        self.store.save(path, saved)  # Intent is durable before any model call.
        try:
            response, request_id = self.api.request('responses', payload)
        except (OSError, ValueError, KeyError, TypeError) as error:
            saved.update(status='uncertain', error_type=type(error).__name__, http_status=getattr(error, 'code', None))
            self.store.save(path, saved)
            raise
        saved.update(response=response, request_id=request_id, completed_at=now(), status='invalid')
        self.store.save(path, saved)
        require(response.get('status') == 'completed', 'Risposta GPT incompleta: nessun retry implicito')
        output = validate(stage, vision_result(response))
        saved.update(status='completed', output=output)
        self.store.save(path, saved)
        return output

    def strategies(self, count=5, revision=1):
        require(type(count) is int and 1 <= count <= 5, 'Da una a cinque strategie')
        intent = self.store.frozen()['intent']
        value = self.invoke('strategies', [dict(role='user', content=[dict(type='input_text', text=
            STRATEGY_INSTRUCTIONS+'\n'+json.dumps(dict(intent=intent, count=count, taxonomy=TAXONOMY,
            previous_calendar_year=int(now()[:4])-1)))])], revision)
        require(len(value['strategies']) == count, 'Numero strategie diverso dalla richiesta')
        return value

    def adapt(self, strategy, profile, revision=1):
        validate('strategies', dict(strategies=[strategy]))
        validate('provider_profile', profile)
        value = self.invoke('adaptation', [dict(role='user', content=[dict(type='input_text', text=
            ADAPT_INSTRUCTIONS+'\n'+json.dumps(dict(strategy=strategy, provider_profile=profile)))])], revision)
        require(all(row['mode'] in profile['modes'] for row in value['variants']), 'Modalità provider non supportata')
        return value
