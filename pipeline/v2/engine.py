"""Independent, resumable Batch flows; outputs are experimental candidates only."""
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import io
import math
import os
from PIL import Image, ImageOps
from ..batch_api import MAX_INPUT_BYTES, TERMINAL
from ..batch_engine_io import digest, write_bytes
from ..batch_store import safe_path
from ..batch_transport import BatchTransport
from ..editorial import image_result, vision_result, now
from ..importer import local_file
from ..run import optimize
from .protocol import VERSION, PROFILE_INSTRUCTIONS, visual_profile, generation_plan, provenance, identifier, require, evidence


@dataclass(frozen=True)
class Config:
    # No ranking, threshold, assigned difficulty, reference or learned preference.
    analysis_model: str = ''
    image_model: str = ''
    evaluator_model: str = ''
    max_evaluations: int = 200
    max_generations: int = 200
    max_regenerations: int = 1
    run_usd: float = 0
    daily_usd: float = 0
    evaluation_usd: float = 0
    generation_usd: float = 0
    size: str = '1024x1024'
    quality: str = 'medium'
    max_output_tokens: int = 4000
    reasoning_effort: str | None = None

    @classmethod
    def environment(cls):
        model = os.getenv('OPENAI_V2_EVALUATOR_MODEL', '')
        return cls(analysis_model=model, evaluator_model=model, image_model=os.getenv('OPENAI_V2_IMAGE_MODEL', ''),
                   max_evaluations=int(os.getenv('EDITORIAL_V2_MAX_EVALUATIONS', '200')),
                   max_generations=int(os.getenv('EDITORIAL_V2_MAX_GENERATIONS', '200')),
                   run_usd=float(os.getenv('EDITORIAL_V2_RUN_USD', '0')), daily_usd=float(os.getenv('EDITORIAL_V2_DAILY_USD', '0')),
                   evaluation_usd=float(os.getenv('EDITORIAL_V2_EVALUATION_USD', '0')), generation_usd=float(os.getenv('EDITORIAL_V2_GENERATION_USD', '0')),
                   size=os.getenv('OPENAI_V2_IMAGE_SIZE', '1024x1024'), quality=os.getenv('OPENAI_V2_IMAGE_QUALITY', 'medium'),
                   max_output_tokens=int(os.getenv('OPENAI_V2_MAX_OUTPUT_TOKENS', '4000')),
                   reasoning_effort=os.getenv('OPENAI_V2_REASONING_EFFORT') or None)

    def validate(self, paid=False, origin=None):
        require(all(type(getattr(self, key)) is int and 1 <= getattr(self, key) <= 200 for key in ('max_evaluations', 'max_generations')), 'Limiti v2 non validi')
        require(self.max_regenerations == 1, 'Nessuna rigenerazione automatica nel protocollo v2')
        require(type(self.max_output_tokens) is int and 1000 <= self.max_output_tokens <= 4000 and self.reasoning_effort in (None, 'none', 'low', 'medium', 'high'), 'Limiti di valutazione v2 non validi')
        amounts = (self.run_usd, self.daily_usd, self.evaluation_usd, self.generation_usd)
        require(all(type(n) in (int, float) and math.isfinite(n) and n >= 0 for n in amounts), 'Budget v2 non valido')
        require(self.size in ('1024x1024', '1024x1536', '1536x1024') and self.quality in ('low', 'medium', 'high'), 'Parametri immagine v2 non validi')
        if paid:
            require(bool(self.evaluator_model) and min(self.run_usd, self.daily_usd, self.evaluation_usd) > 0, 'Configurare modello visivo e budget v2 espliciti')
            if origin == 'AI':
                require(bool(self.image_model) and self.generation_usd > 0, 'Configurare generatore e prezzo v2 espliciti')


def media(raw, folder, group, uid):
    require(0 < len(raw) <= 12_000_000, 'File v2 vuoto o oltre 12 MB')
    Image.MAX_IMAGE_PIXELS = 30_000_000
    with Image.open(io.BytesIO(raw)) as picture:
        require(picture.format in ('JPEG', 'MPO', 'PNG', 'WEBP') and picture.width * picture.height <= 30_000_000, 'File v2 non fotografico o troppo grande')
        source_format = picture.format
        picture.load()
        ext = {'JPEG': 'jpg', 'MPO': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}[picture.format]
    original = f'{group}/{uid}/original.{ext}'
    preview = f'{group}/{uid}/preview.webp'
    write_bytes(safe_path(folder, original), raw)
    optimize(raw, safe_path(folder, preview), maximum_edge=1024)
    safe_path(folder, preview).chmod(0o600)
    derivative = safe_path(folder, preview).read_bytes()
    with Image.open(io.BytesIO(derivative)) as picture:
        width, height = picture.size
        pixels = list(ImageOps.grayscale(picture).resize((9, 8)).getdata())
    phash = f'{sum((pixels[y*9+x] > pixels[y*9+x+1]) << (y*8+x) for y in range(8) for x in range(8)):016x}'
    presentation = dict(version='1.0.0', operations=['exif_orientation', 'resize', 'compression', 'format_conversion'],
                        whole_frame=True, maximum_edge=1024, webp_quality=85)
    if source_format == 'MPO':
        presentation.update(source_container='MPO', selected_frame=0, original_frames_preserved=True)
    return dict(file=original, derived_file=preview, original_sha256=digest(raw), sha256=digest(derivative),
                perceptual_hash=phash, width=width, height=height, bytes=len(derivative), format='webp',
                presentation=presentation)


def initialize(origin, inputs, root, folder, cfg, uid, simulated=False, license_info=None):
    root, folder = root.resolve(), folder.resolve()
    identifier(uid)
    require(origin in ('REAL', 'AI'), 'Flusso v2 non valido')
    cfg.validate(paid=not simulated, origin=origin)
    attempts = []
    if origin == 'AI':
        generation_plan(inputs)
        require(license_info and license_info.get('author') and 'url' in license_info, 'Autore e stato dei diritti SLOP richiesti')
        for idea in inputs['ideas']:
            attempts.append(dict(id=idea['id'], origin='AI', idea=idea, status='planned'))
    else:
        require(isinstance(inputs, list) and 1 <= len(inputs) <= 200, 'Manifest REAL da 1 a 200 candidate richiesto')
        seen = {}
        for row in inputs:
            require(isinstance(row, dict) and set(row) == {'id', 'file', 'provenance'}, 'Manifest REAL v2: solo id, file e provenienza documentale')
            identifier(row['id'])
            proof = provenance(row['provenance'], 'REAL')
            raw = local_file(row['file'], root).read_bytes()
            record = dict(id=row['id'], origin='REAL', status='source', provenance=proof, **media(raw, folder, 'inputs', row['id']))
            keys = [('source', proof['provider'], proof['source_id']), ('url', proof['source_url']), ('sha', record['original_sha256']), ('sha', record['sha256'])]
            duplicate = next((seen[key] for key in keys if key in seen), None)
            if duplicate:
                record.update(status='duplicate', duplicate_of=duplicate)
            else:
                for key in keys:
                    seen[key] = row['id']
            attempts.append(record)
    require(len({row['id'] for row in attempts}) == len(attempts), 'Identificativi candidati duplicati')
    require(len(attempts) <= cfg.max_evaluations and (origin != 'AI' or len(attempts) <= cfg.max_generations), 'Capacità v2 insufficiente')
    minimum = len(attempts) * (cfg.evaluation_usd + (cfg.generation_usd if origin == 'AI' else 0))
    require(simulated or minimum <= min(cfg.run_usd, cfg.daily_usd), 'Budget insufficiente per il primo passaggio v2')
    return dict(protocol_version=VERSION, id=uid, origin=origin, config=asdict(cfg), simulated=simulated,
                license=license_info, status='active', stage='planned', phase=0, created_at=now(), attempts=attempts,
                jobs=[], candidates=[], calls=dict(evaluation=0, generation=0, regeneration=0), reserved_usd=0,
                cancel_requested=False)


class Engine(BatchTransport):
    def __init__(self, state, folder, api, remote=None, max_bytes=MAX_INPUT_BYTES):
        require(state.get('protocol_version') == VERSION and state.get('origin') in ('REAL', 'AI'), 'Checkpoint v2 incompatibile; nessuna conversione automatica dei lotti storici')
        require(state.get('transport', 'batch') == 'batch', 'Run sincrono: non riprendere attraverso il motore Batch')
        self.state, self.folder, self.api, self.remote = state, folder.resolve(), api, remote
        self.cfg = Config(**state['config'])
        self.cfg.validate()
        require(1024 <= max_bytes <= MAX_INPUT_BYTES, 'Dimensione JSONL non valida')
        self.max_bytes = max_bytes

    def _attempt(self, uid):
        return next(row for row in self.state['attempts'] if row['id'] == uid)

    def _body(self, item):
        payload = super()._body(item)
        if 'image_path' in item['recipe']:
            payload['max_output_tokens'] = self.cfg.max_output_tokens
            if self.cfg.reasoning_effort is not None:
                payload['reasoning'] = {'effort': self.cfg.reasoning_effort}
        return payload

    def _setup(self):
        if self.state['jobs']:
            return
        if self.state['origin'] == 'REAL':
            items = [self._vision_item(row['id'], 'evaluation', self.cfg.evaluator_model, PROFILE_INSTRUCTIONS, row['derived_file']) for row in self.state['attempts'] if row['status'] == 'source']
            self._new_phase('profile', items)
        else:
            items = [dict(target=row['id'], kind='generation', recipe=dict(model=self.cfg.image_model,
                         prompt=row['idea']['prompt'], parameters=dict(n=1, size=self.cfg.size, quality=self.cfg.quality))) for row in self.state['attempts']]
            self._new_phase('generation', items)

    def _decode(self, job, item, body, response):
        record = self._attempt(item['target'])
        trace = dict(batch_id=job['provider_id'], custom_id=item['custom_id'], request_id=response.get('request_id'),
                     stage=job['stage'], model=body.get('model', job['model']))
        record.setdefault('batch_jobs', []).append(trace)
        if job['stage'] == 'generation':
            raw = image_result(body)
            record.update(media(raw, self.folder, 'generations', record['id']))
            created = body.get('created')
            generated_at = datetime.fromtimestamp(created, timezone.utc).isoformat().replace('+00:00', 'Z') if type(created) is int and 0 < created < 100000000000 else now()
            idea = record['idea']
            record['provenance'] = dict(kind='AI', content_kind='synthetic', license_url=self.state['license']['url'],
                author=self.state['license']['author'], evidence=[dict(id='generation', url='https://platform.openai.com/',
                statement=f"Generazione text-to-image tracciata: batch {trace['batch_id']}, richiesta {trace['custom_id']}; dossier e output archiviati privatamente.")],
                transformations=['exif_orientation', 'resize', 'compression', 'format_conversion'], idea_id=idea['id'],
                **{key: idea[key] for key in ('mode', 'idea', 'prompt')}, model=self.cfg.image_model,
                parameters=item['recipe']['parameters'], input_kind='text-only', fully_synthetic=True,
                generated_at=generated_at, timestamp_source='provider_created' if type(created) is int and 0 < created < 100000000000 else 'retrieved_at',
                batch_id=trace['batch_id'], custom_id=trace['custom_id'])
            provenance(record['provenance'], 'AI')
            record['status'] = 'generated'
        else:
            record['profile'] = visual_profile(vision_result(body))
            record['status'] = 'profiled'
        return True

    def _advance(self, jobs):
        if self.state['stage'] == 'generation':
            items = [self._vision_item(row['id'], 'evaluation', self.cfg.evaluator_model, PROFILE_INSTRUCTIONS, row['derived_file'])
                     for row in self.state['attempts'] if row['status'] == 'generated']
            if items:
                self._new_phase('profile', items)
                return
        candidates = []
        for row in self.state['attempts']:
            if row['status'] != 'profiled':
                continue
            # Defaults are deliberately modest; a human must verify the wording.
            explanation = dict(observations=row['profile']['observations'], misleading_assumptions=[],
                uncertainty='I soli pixel possono non consentire una classificazione affidabile. La provenienza richiede una verifica separata.',
                origin_evidence_ids=sorted(evidence(row['provenance']['evidence'])))
            candidates.append({key: row[key] for key in ('origin', 'original_sha256', 'sha256', 'perceptual_hash', 'width', 'height', 'bytes', 'format', 'presentation', 'profile', 'provenance')} |
                              dict(id=digest((self.state['id'] + '\0' + row['id']).encode())[:32], input_id=row['id'], run_id=self.state['id'], simulated=self.state['simulated'], feedback=explanation,
                                   review_state='quarantine', file=row['file'], derived_file=row['derived_file']))
        self.state['candidates'] = candidates
        self.state.update(status='completed', stage='completed')
        self.save()

    def tick(self, execute=False, adopt=None):
        # Real spending always needs a server ledger; local state cannot reset a
        # daily/cumulative budget. Simulations use only their fixture transport.
        if execute and not self.state['simulated']:
            require(self.remote is not None and os.getenv('ENABLE_EDITORIAL_V2_PAID') == 'true', 'Chiamate v2 richiedono abilitazione esplicita e ledger server')
        # Export is retryable after an interrupted completed checkpoint.
        result = super().tick(execute=execute, adopt=adopt)
        if self.state['status'] == 'completed' and self.remote:
            self.remote.export_candidates(self.state['candidates'])
        return result

    def cancel(self):
        if self.state['status'] in ('completed', 'cancelled', 'stopped'):
            return self.summary()
        if self.state.get('error'):
            self.state['error_before_cancellation'] = self.state.pop('error')
        self.state['cancel_requested'] = True
        self.save()
        pending = False
        for job in self.state['jobs']:
            if job['status'] == 'submitting':
                self._reconcile(job)
            if not job['provider_id'] or job.get('collected'):
                continue
            result = self.api.retrieve(job['provider_id'])
            if result['status'] not in TERMINAL and result['status'] != 'cancelling':
                result = self.api.cancel(job['provider_id'])
            job['status'] = result['status']
            if result['status'] in ('completed', 'expired', 'cancelled'):
                self._collect(job, result)
            pending |= result['status'] not in TERMINAL
        self.state.update(status='paused' if pending else 'cancelled', stage='cancelling' if pending else 'cancelled')
        self.save()
        return self.summary()

    def summary(self):
        return dict(id=self.state['id'], version=VERSION, origin=self.state['origin'], status=self.state['status'],
                    stage=self.state['stage'], candidates=len(self.state['candidates']), calls=self.state['calls'],
                    reserved_usd=self.state['reserved_usd'], simulated=self.state['simulated'], published=False,
                    error=self.state.get('error'))
