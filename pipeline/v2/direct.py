"""Direct Responses/Images runner: original pixels -> crop -> final-pixel profile.

No Files, Batch, background responses or implicit retry. Real calls require the
existing private server ledger. Default CLI only inspects the input manifest.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener

from PIL import Image, ImageOps

from ..batch import workspace
from ..batch_store import safe_path
from ..editorial import PipelineStop, image_payload, image_result, now, vision_payload, vision_result, write_private
from ..importer import NoRedirect
from .engine import Config, initialize, media
from .presentation import oriented_frame, standard_copy, whole_frame_copy
from .protocol import VERSION, SCHEMA, PROFILE_INSTRUCTIONS, require, evidence, provenance, visual_profile
from .run import Remote, inspect
from .smart_crop import crop_options, payload as crop_payload, validate_decision


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


class DirectHTTPError(OSError):
    """Private provider rejection receipt, never an instruction to retry."""
    def __init__(self, code, request_id, response):
        super().__init__('Direct API returned HTTP ' + str(code))
        self.code, self.request_id, self.response = code, request_id, response


class DirectAPI:
    def __init__(self, key, opener=None):
        require(bool(key), 'OPENAI_API_KEY mancante')
        self.key = key
        self.opener = opener or build_opener(NoRedirect()).open

    def request(self, endpoint, body):
        require(endpoint in ('responses', 'images/generations'), 'Endpoint diretto non ammesso')
        if endpoint == 'responses':
            require(body.get('store') is False and not body.get('background') and not body.get('tools'), 'Solo Responses dirette senza strumenti')
        request = Request('https://api.openai.com/v1/' + endpoint, data=json.dumps(body).encode(),
                          headers={'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'})
        try:
            with self.opener(request, timeout=180) as response:
                raw = response.read(40_000_001)
                require(len(raw) <= 40_000_000, 'Risposta diretta oltre il limite')
                return json.loads(raw), response.headers.get('x-request-id')
        except HTTPError as error:
            # Archive only provider response data, never the authorized request.
            # The original failed request remains paid/reserved and is not retried.
            raw = error.read(65_537)
            try:
                response = json.loads(raw) if len(raw) <= 65_536 else dict(error_body_truncated=True)
            except (ValueError, UnicodeError):
                response = dict(error_body=raw[:65_536].decode('utf-8', errors='replace'))
            raise DirectHTTPError(error.code, error.headers.get('x-request-id'), response) from None


def profile_schema():
    properties = dict(version=dict(type='string', enum=[VERSION]), photographic=dict(type='boolean'), usable=dict(type='boolean'))
    properties.update({k: {'type': ['string', 'null'], 'enum': [*choices, None]} for k, choices in SCHEMA['enums'].items()})
    properties.update({k: {'type': ['number', 'null']} for k in SCHEMA['scalars']})
    properties.update({k: dict(type='array', items=dict(type='string')) for k in SCHEMA['lists']})
    return dict(type='object', additionalProperties=False, required=list(properties), properties=properties)


class DirectEngine:
    def __init__(self, state, folder, api, remote=None, concurrency=4):
        require(state.get('transport') == 'synchronous' and state.get('protocol_version') == VERSION, 'Checkpoint diretto richiesto')
        require(type(concurrency) is int and 1 <= concurrency <= 8, 'Concorrenza diretta da 1 a 8')
        self.state, self.folder, self.api, self.remote = state, folder.resolve(), api, remote
        self.cfg = Config(**state['config'])
        self.cfg.validate()
        require(self.cfg.presentation_mode == 'whole_frame' or self.cfg.size == '1024x1024', 'I checkpoint con ritaglio quadrato richiedono il formato legacy')
        self.concurrency = concurrency

    def save(self):
        write_private(self.folder / 'state.json', self.state)
        if self.remote:
            self.remote.save(self.state, self.folder)

    def row(self, uid):
        return next(r for r in self.state['attempts'] if r['id'] == uid)

    def job(self, stage, row):
        uid = digest((self.state['id'] + '\0' + stage + '\0' + row['id']).encode())[:32]
        prior = next((j for j in self.state['jobs'] if j['id'] == uid), None)
        if prior:
            return prior
        result = dict(id=uid, target=row['id'], stage=stage, kind='generation' if stage == 'generation' else 'evaluation',
                      status='prepared', reserved=False)
        self.state['jobs'].append(result)
        self.save()
        return result

    def body(self, job):
        row = self.row(job['target'])
        if job['stage'] == 'generation':
            return 'images/generations', image_payload(self.cfg.image_model, row['idea']['prompt'],
                                                     dict(n=1, size=self.cfg.size, quality=self.cfg.quality))
        if job['stage'] == 'crop':
            frame = oriented_frame(safe_path(self.folder, row['file']).read_bytes())
            body = crop_payload(frame, row['crop_options'], self.cfg.evaluator_model, row['original_sha256'])
        else:
            require(row.get('presentation', {}).get('version') in ('1.1.0', '1.2.0'), 'Profilo solo sulla variante finale')
            image = safe_path(self.folder, row['derived_file']).read_bytes()
            require(digest(image) == row['sha256'], 'Pixel finali modificati prima del profilo')
            body = vision_payload(self.cfg.evaluator_model, PROFILE_INSTRUCTIONS, image)
            body.update(max_output_tokens=self.cfg.max_output_tokens,
                        text=dict(format=dict(type='json_schema', name='final_visual_profile', strict=True, schema=profile_schema())))
        body.update(store=False, service_tier='default', reasoning=dict(effort=self.cfg.reasoning_effort or 'none'))
        return 'responses', body

    def reserve(self, job):
        kind = job['kind']
        cost = self.cfg.generation_usd if kind == 'generation' else self.cfg.evaluation_usd
        if not job['reserved']:
            counts = self.state['calls'].copy()
            counts[kind] += 1
            require(counts['evaluation'] <= self.cfg.max_evaluations and counts['generation'] <= self.cfg.max_generations and
                    round(self.state['reserved_usd'] + cost, 6) <= self.cfg.run_usd, 'Limite di chiamate o budget diretto raggiunto')
        # Reconfirm server gate/lease even if a previous attempt reserved before
        # losing the acknowledgement. Server reservation ID never changes.
        if self.remote:
            result = self.remote.reserve_batch(dict(id=job['id'], items=[dict(custom_id=job['id'], kind=kind)]))
            require(result['reserved_usd'] <= cost + 1e-9, 'Prenotazione server superiore alla stima diretta')
        if not job['reserved']:
            self.state['calls'] = counts
            self.state['reserved_usd'] = round(self.state['reserved_usd'] + cost, 6)
            job['reserved'] = True
            self.save()

    def apply_crop(self, row, selected, decision=None, request_id=None):
        raw = safe_path(self.folder, row['file']).read_bytes()
        require(digest(raw) == row['original_sha256'], 'Originale modificato')
        path = safe_path(self.folder, row['derived_file'])
        row.setdefault('acquisition_preview_sha256', row['sha256'])
        presentation = standard_copy(raw, path, crop_box=selected['box'])
        presentation['selection'] = dict(method='terra' if decision else 'already_square', decision=decision,
                                         selected_id=selected['id'], request_id=request_id,
                                         fallback_center=bool(decision and decision['crop_id'] is None))
        self.record_presentation(row, path, presentation)

    def apply_whole_frame(self, row):
        raw = safe_path(self.folder, row['file']).read_bytes()
        require(digest(raw) == row['original_sha256'], 'Originale modificato')
        path = safe_path(self.folder, row['derived_file'])
        row.setdefault('acquisition_preview_sha256', row['sha256'])
        self.record_presentation(row, path, whole_frame_copy(raw, path))

    def record_presentation(self, row, path, presentation):
        preview = path.read_bytes()
        with Image.open(path) as picture:
            pixels = list(ImageOps.grayscale(picture).resize((9, 8)).getdata())
        phash = sum((pixels[y*9+x] > pixels[y*9+x+1]) << (y*8+x) for y in range(8) for x in range(8))
        row.update(presentation=presentation, sha256=digest(preview), width=presentation['width'], height=presentation['height'],
                   bytes=len(preview), format='webp', perceptual_hash=f'{phash:016x}', status='cropped')

    def consume(self, job, response, request_id):
        row = self.row(job['target'])
        if job['stage'] == 'generation':
            row.update(media(image_result(response), self.folder, 'generations', row['id']))
            created = response.get('created')
            is_created = type(created) is int and 0 < created < 100000000000
            stamp = datetime.fromtimestamp(created, timezone.utc).isoformat() if is_created else now()
            idea = row['idea']
            row['provenance'] = dict(kind='AI', content_kind='synthetic', license_url=self.state['license']['url'],
                author=self.state['license']['author'], evidence=[dict(id='generation', url='https://platform.openai.com/',
                statement='Generazione diretta text-to-image tracciata dalla richiesta ' + request_id + '; ricevuta e originale conservati.')],
                transformations=['exif_orientation', 'resize', 'compression', 'format_conversion'],
                idea_id=idea['id'], **{key: idea[key] for key in ('mode', 'idea', 'prompt')}, model=self.cfg.image_model,
                parameters=dict(n=1, size=self.cfg.size, quality=self.cfg.quality), input_kind='text-only', fully_synthetic=True,
                generated_at=stamp, timestamp_source='provider_created' if is_created else 'retrieved_at',
                transport='synchronous', request_id=request_id)
            provenance(row['provenance'], 'AI')
            row['status'] = 'generated'
        elif job['stage'] == 'crop':
            require(response.get('status') == 'completed', 'Scelta ritaglio incompleta')
            decision = validate_decision(vision_result(response), row['crop_options'])
            selected = next(r for r in row['crop_options'] if r['id'] == decision['crop_id']) if decision['crop_id'] else next(r for r in row['crop_options'] if r['center'])
            self.apply_crop(row, selected, decision, request_id)
        else:
            require(response.get('status') == 'completed', 'Profilo incompleto')
            image = safe_path(self.folder, row['derived_file']).read_bytes()
            require(digest(image) == job['profile_image_sha256'] == row['sha256'], 'Profilo riferito a pixel diversi dalla variante')
            row.update(profile=visual_profile(vision_result(response)), profile_image_sha256=row['sha256'],
                       profile_request_id=request_id, status='profiled')
        job.update(status='completed', request_id=request_id, response_model=response.get('model'), usage=response.get('usage'))

    def phase(self, stage, rows):
        self.state['stage'] = stage
        self.save()
        todo = iter(rows)
        active = {}
        halted = False
        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            def submit_next():
                nonlocal halted
                try:
                    row = next(todo)
                except StopIteration:
                    return False
                job = self.job(stage, row)
                require(job['status'] == 'prepared', 'Invio incerto: ispezionare la ricevuta, nessun reinvio')
                try:
                    endpoint, body = self.body(job)
                    checksum = digest(json.dumps(body, sort_keys=True).encode())
                    require(not job.get('payload_sha256') or job['payload_sha256'] == checksum, 'Payload diverso dalla prenotazione')
                    job['payload_sha256'] = checksum
                    if stage == 'profile':
                        job['profile_image_sha256'] = row['sha256']
                    self.reserve(job)
                    job.update(status='submitting', submitted_at=now(), endpoint=endpoint)
                    self.save()  # Durable intent before every direct API call.
                    active[pool.submit(self.api.request, endpoint, body)] = job
                    return True
                except (ValueError, OSError, KeyError, TypeError):
                    halted = True
                    return False

            while len(active) < self.concurrency and not halted and submit_next():
                pass
            while active:
                done, _ = wait(active, timeout=30, return_when=FIRST_COMPLETED)
                if not done:
                    self.save()  # Keep the server lease alive without inference.
                    print(json.dumps(dict(run=self.state['id'], stage=stage, waiting=len(active))), flush=True)
                for future in done:
                    job = active.pop(future)
                    try:
                        response, request_id = future.result()
                        write_private(self.folder / 'receipts' / (job['id'] + '.json'),
                                      dict(payload_sha256=job['payload_sha256'], request_id=request_id, response=response))
                        require(isinstance(request_id, str) and bool(request_id), 'Request ID diretto mancante')
                        self.consume(job, response, request_id)
                    except (ValueError, OSError, KeyError, TypeError) as error:
                        job.update(status='error', error_type=type(error).__name__, http_status=getattr(error, 'code', None))
                        if isinstance(error, DirectHTTPError):
                            write_private(self.folder / 'error-receipts' / (job['id'] + '.json'),
                                          dict(payload_sha256=job['payload_sha256'], request_id=error.request_id,
                                               http_status=error.code, response=error.response))
                            job['request_id'] = error.request_id
                        halted = True
                    self.save()
                    print(json.dumps(dict(run=self.state['id'], stage=stage, status=job['status'],
                                          completed=sum(j['status'] == 'completed' for j in self.state['jobs']))), flush=True)
                while len(active) < self.concurrency and not halted and submit_next():
                    pass
        require(not halted, 'Flusso diretto sospeso; risultati e prenotazioni conservati, nessun retry automatico')

    def recover_receipts(self):
        for job in self.state['jobs']:
            if job['status'] != 'submitting':
                continue
            path = self.folder / 'receipts' / (job['id'] + '.json')
            if path.exists():
                receipt = json.loads(path.read_text())
                require(receipt.get('payload_sha256') == job.get('payload_sha256') and receipt.get('request_id'), 'Ricevuta non associata al payload')
                self.consume(job, receipt['response'], receipt['request_id'])
                self.save()
        require(all(j['status'] in ('prepared', 'completed') for j in self.state['jobs']), 'Richiesta incerta o fallita: nessun retry automatico')

    def run(self, execute=False):
        require(execute, 'Invii diretti richiedono --execute')
        require(self.state['simulated'] or (self.remote is not None and os.getenv('ENABLE_EDITORIAL_V2_PAID') == 'true'),
                'Spesa diretta richiede gate esplicito e ledger server')
        if self.state['status'] == 'completed':
            if self.remote:
                self.remote.export_candidates(self.state['candidates'])
            return self.summary()
        try:
            self.recover_receipts()
            self.state['status'] = 'active'
            self.state.pop('error', None)
            if self.state['origin'] == 'AI':
                self.phase('generation', [r for r in self.state['attempts'] if r['status'] == 'planned'])
            cropping = []
            for row in self.state['attempts']:
                if row['status'] not in ('source', 'generated'):
                    continue
                if self.cfg.presentation_mode == 'whole_frame':
                    self.apply_whole_frame(row)
                    continue
                frame = oriented_frame(safe_path(self.folder, row['file']).read_bytes())
                row['crop_options'] = crop_options(*frame.size)
                if frame.size[0] == frame.size[1]:
                    self.apply_crop(row, row['crop_options'][0])
                else:
                    cropping.append(row)
            self.save()
            if cropping:
                self.phase('crop', cropping)
            self.phase('profile', [r for r in self.state['attempts'] if r['status'] == 'cropped'])
            candidates = []
            for row in self.state['attempts']:
                if row['status'] != 'profiled':
                    continue
                require(row['profile_image_sha256'] == row['sha256'], 'Profilo della variante mancante')
                explanation = dict(observations=row['profile']['observations'], misleading_assumptions=[],
                                   uncertainty='I soli pixel possono non consentire una classificazione affidabile; origine e diritti richiedono evidenze e revisione.',
                                   origin_evidence_ids=sorted(evidence(row['provenance']['evidence'])))
                candidate = {key: row[key] for key in ('origin', 'original_sha256', 'sha256', 'perceptual_hash', 'width', 'height',
                    'bytes', 'format', 'presentation', 'profile', 'profile_image_sha256', 'provenance', 'file', 'derived_file')}
                candidate.update(id=digest((self.state['id'] + '\0' + row['id']).encode())[:32], input_id=row['id'],
                                 run_id=self.state['id'], simulated=self.state['simulated'], feedback=explanation, review_state='quarantine')
                candidates.append(candidate)
            self.state.update(candidates=candidates, status='completed', stage='completed')
            self.save()
            if self.remote:
                self.remote.export_candidates(candidates)
        except (ValueError, OSError, KeyError, TypeError) as error:
            if self.state['status'] != 'completed':
                self.state.update(status='paused', error=str(error) if isinstance(error, PipelineStop) else 'Flusso diretto interrotto; ispezionare checkpoint e ricevute')
                self.save()
            raise
        return self.summary()

    def summary(self):
        return dict(run=self.state['id'], transport='synchronous', origin=self.state['origin'], status=self.state['status'],
                    candidates=len(self.state['candidates']), calls=self.state['calls'], reserved_usd=self.state['reserved_usd'], published=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path, nargs='?')
    parser.add_argument('--origin', choices=('REAL', 'AI'), default='AI')
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--base', default='http://127.0.0.1:8787')
    parser.add_argument('--out', type=Path, default=Path('.pipeline/v2/direct-runs'))
    parser.add_argument('--concurrency', type=int, default=4)
    args = parser.parse_args(argv)
    try:
        value = json.loads(args.manifest.read_text()) if args.manifest else None
        if not args.execute:
            result = inspect(args.origin, value)
            phases = (['generation'] if args.origin == 'AI' else [])
            if Config.environment().presentation_mode == 'square_crop':
                phases.append('crop')
            result.update(transport='synchronous', phases=phases + ['profile'])
            print(json.dumps(result))
            return 0
        cfg = Config.environment()
        cfg.validate(paid=True, origin=args.origin)
        require(os.getenv('ENABLE_EDITORIAL_V2_PAID') == 'true', 'Invii diretti non abilitati')
        folder = (args.out / args.run_id).resolve()
        remote = Remote(args.base, os.getenv('REAL_OR_SLOP_ADMIN_TOKEN', ''), args.run_id)
        with workspace(folder):
            if not args.resume:
                require(args.manifest is not None and not (folder / 'state.json').exists(), 'Manifest e workspace nuovo richiesti')
                state = initialize(args.origin, value, args.manifest.resolve().parent, folder, cfg, args.run_id, False,
                    dict(url=os.getenv('GENERATED_V2_LICENSE_URL') or None, author=os.getenv('GENERATED_V2_AUTHOR', '')) if args.origin == 'AI' else None)
                state['transport'] = 'synchronous'
                write_private(folder / 'state.json', state)
                remote.call('v2/runs', dict(id=state['id'], origin=state['origin'], config=state['config'], input=value))
            remote.acquire()
            try:
                restored = remote.restore(folder)
                state = restored or json.loads((folder / 'state.json').read_text())
                print(json.dumps(DirectEngine(state, folder, DirectAPI(os.getenv('OPENAI_API_KEY')), remote, args.concurrency).run(True)))
            finally:
                remote.release()
        return 0
    except (ValueError, OSError, KeyError, TypeError):
        print('Flusso diretto interrotto; controllare configurazione, budget, checkpoint e ricevute. Nessun retry implicito.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
