"""Prepare a bounded, independent 200-candidate study with direct API calls.

Preparation has its own conservative allowance, subtracted from the worker cap.
No photo is supplied to SLOP ideation. Source records remain unverified.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import html
import io
import json
import re
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit, parse_qsl, urlencode

from PIL import Image

from ..editorial import write_private, vision_result, now
from ..licenses import recognized_license
from ..providers import Client
from ..run import download
from .direct import digest
from .discovery import EXPLORATION_INSTRUCTIONS, plan as search_plan, collect
from .protocol import VERSION, generation_plan, provenance, require, https
from .search_sources import SearchClient

IDEATION = '''Crea idee indipendenti per immagini integralmente sintetiche da testo, per un campione visivo vario.
Non ricevi fotografie, titoli REAL, fonti o preferenze editoriali storiche. Non usare riferimenti fotografici o URL.
Esplora scene quotidiane e sorprendenti, più soggetti, relazioni, dettagli, paesaggi, materiali, texture e scene dense.
Non imporre anomalie, un soggetto isolato, bellezza o un'unica estetica. Mantieni un linguaggio visivo fotografico.
Alterna liberamente idee originali definite e prompt aperti che lascino libertà al generatore, senza quote tematiche.
Non usare nomi di persone reali, marchi, testi da riprodurre o immagini esistenti. Ogni prompt deve essere autonomo.
Scrivi prompt in inglese fino a 65 parole; idea in italiano fino a 20 parole. Usa esattamente gli ID forniti una volta ciascuno.
Restituisci il piano JSON version 2.0.0, independent true, ideas con id, mode (original oppure open), idea, prompt.'''


class Preparation:
    def __init__(self, folder, api, model='gpt-6.1-terra', cap=.2, reservation=.02):
        self.folder, self.api, self.model, self.cap, self.reservation = folder, api, model, cap, reservation
        self.path = folder / 'preparation.json'
        self.state = json.loads(self.path.read_text()) if self.path.exists() else dict(model=model, cap=cap, reservation=reservation, reserved_usd=0, calls=[])
        require(self.state['model'] == model and self.state['cap'] == cap and self.state['reservation'] == reservation, 'Preparazione diversa dal checkpoint')

    def call(self, uid, instructions, schema, maximum=4000):
        body = dict(model=self.model, instructions=instructions, input='Restituisci esclusivamente il JSON richiesto.',
                    store=False, service_tier='default', reasoning=dict(effort='none'), max_output_tokens=maximum,
                    text=dict(format=dict(type='json_schema', name='study_preparation', strict=True, schema=schema)))
        checksum = digest(json.dumps(body, sort_keys=True).encode())
        row = next((r for r in self.state['calls'] if r['id'] == uid), None)
        receipt_path = self.folder / 'preparation-receipts' / (uid + '.json')
        if row:
            require(row['payload_sha256'] == checksum and receipt_path.exists(), 'Preparazione incerta: nessun reinvio')
            receipt = json.loads(receipt_path.read_text())
        else:
            require(round(self.state['reserved_usd'] + self.reservation, 6) <= self.cap, 'Tetto preparazione raggiunto')
            row = dict(id=uid, payload_sha256=checksum, status='submitting', timestamp=now())
            self.state['calls'].append(row)
            self.state['reserved_usd'] = round(self.state['reserved_usd'] + self.reservation, 6)
            write_private(self.path, self.state)
            response, request_id = self.api.request('responses', body)
            receipt = dict(response=response, request_id=request_id, payload_sha256=checksum)
            write_private(receipt_path, receipt)
        require(receipt['payload_sha256'] == checksum and receipt['request_id'] and receipt['response'].get('status') == 'completed', 'Preparazione incompleta')
        value = vision_result(receipt['response'])
        row.update(status='completed', request_id=receipt['request_id'], usage=receipt['response'].get('usage'))
        write_private(self.path, self.state)
        return value

    def freeze(self, count=100):
        path = self.folder / 'slop-plan.json'
        if (self.folder / 'inputs-frozen.json').exists():
            frozen = json.loads((self.folder / 'inputs-frozen.json').read_text())
            require(frozen['slop_plan_sha256'] == digest(path.read_bytes()) and
                    frozen['exploration_sha256'] == digest((self.folder / 'exploration.json').read_bytes()), 'Input congelati modificati')
            require(len(generation_plan(json.loads(path.read_text()))['ideas']) == count, 'Numerosità diversa dallo studio congelato')
            return
        ideas = generation_plan(json.loads(path.read_text()))['ideas'] if path.exists() else []
        for start in range(len(ideas), count, 20):
            ids = ['slop-' + f'{index+1:03}' for index in range(start, min(start+20, count))]
            properties = dict(id=dict(type='string', enum=ids), mode=dict(type='string', enum=['original', 'open']),
                              idea=dict(type='string'), prompt=dict(type='string'))
            schema = dict(type='object', additionalProperties=False, required=['version', 'independent', 'ideas'],
                          properties=dict(version=dict(type='string', enum=[VERSION]), independent=dict(type='boolean', enum=[True]),
                                          ideas=dict(type='array', items=dict(type='object', additionalProperties=False,
                                                                           required=list(properties), properties=properties))))
            instruction = IDEATION + '\nID: ' + json.dumps(ids) + '\nIdee sintetiche già proposte, evita ripetizioni: ' + json.dumps([r['idea'] for r in ideas], ensure_ascii=False)
            group = self.call('ideas-' + f'{start+1:03}', instruction, schema)
            generation_plan(group)
            require({r['id'] for r in group['ideas']} == set(ids), 'Numero o ID delle idee non validi')
            ideas.extend(group['ideas'])
            print(json.dumps(dict(stage='independent_ideas', completed=len(ideas))), flush=True)
        value = dict(version=VERSION, independent=True, ideas=ideas)
        generation_plan(value)
        write_private(path, value)
        query_path = self.folder / 'exploration.json'
        schema = dict(type='object', additionalProperties=False, required=['queries'],
                      properties=dict(queries=dict(type='array', items=dict(type='string'))))
        if not query_path.exists():
            queries = self.call('independent-queries', EXPLORATION_INSTRUCTIONS + '\nProponi esattamente 8 query.', schema, 1500)
            require(len(queries['queries']) == 8 and len(set(queries['queries'])) == 8, 'Otto query libere distinte richieste')
            write_private(query_path, dict(generator=self.model + ' / direct Responses / query instructions v2.0.0', queries=queries['queries']))
        write_private(self.folder / 'inputs-frozen.json', dict(frozen_at=now(),
            slop_plan_sha256=digest(path.read_bytes()), exploration_sha256=digest(query_path.read_bytes()), independent=True))


def acquire_sources(folder, target=100, max_api_calls=120, result_page=1):
    require(result_page in (1, 2), 'Al massimo due pagine di acquisizione per query congelata')
    require((folder / 'inputs-frozen.json').exists(), 'Congelare idee e query prima della ricerca REAL')
    frozen = json.loads((folder / 'inputs-frozen.json').read_text())
    require(frozen['slop_plan_sha256'] == digest((folder / 'slop-plan.json').read_bytes()) and
            frozen['exploration_sha256'] == digest((folder / 'exploration.json').read_bytes()), 'Input congelati modificati')
    ua = 'RealOrSlop/0.15 (https://github.com/rickymusu-bit/real-or-slop)'
    value = search_plan(34, json.loads((folder / 'exploration.json').read_text()), count=24)

    class PageClient(SearchClient):
        def get(self, url):
            parsed = urlsplit(url)
            params = dict(parse_qsl(parsed.query))
            if result_page == 2 and params.get('gsrsearch') is not None:
                params['gsroffset'] = '10'
            elif result_page == 2 and parsed.hostname in ('api.openverse.org', 'images-api.nasa.gov') and params.get('q'):
                params['page'] = '2'
            elif result_page == 2 and parsed.hostname == 'www.loc.gov' and params.get('q'):
                params['sp'] = '2'
            return super().get(urlunsplit(parsed._replace(query=urlencode(params))))

    collection = folder / ('discovery' if result_page == 1 else 'discovery-page-2')
    if result_page == 2:
        value['result_page'] = 2
        write_private(folder / 'acquisition-supplement.json', dict(reason='Prima pagina insufficiente dopo esclusioni tecniche e deduplica',
            frozen_queries_unchanged=True, result_page=2, source_api_call_cap=2*max_api_calls, paid_search=False))
    result = collect(value, collection, ua, limit=10, max_api_calls=max_api_calls,
                     client=PageClient(ua, max_calls=max_api_calls))
    records, search_calls = [], 0
    for directory in [folder / 'discovery', *([folder / 'discovery-page-2'] if result_page == 2 else [])]:
        records.extend(json.loads((directory / 'manifest.json').read_text()))
        search_calls += json.loads((directory / 'queries.json').read_text())['used_api_calls']
    # Interleave available providers; metadata collection availability is reported,
    # never replaced with a claim of an equal-budget engine comparison.
    groups = {}
    for row in records:
        groups.setdefault(row['metadata']['provider'], []).append(row['metadata'])
    ordered = []
    while any(groups.values()):
        for rows in groups.values():
            if rows:
                ordered.append(rows.pop(0))
    allowed = ['upload.wikimedia.org', 'images-assets.nasa.gov']
    source_folder = folder / 'real-originals'
    source_folder.mkdir(exist_ok=True, mode=0o700)
    ledger_path = folder / 'acquisition.json'
    log = json.loads(ledger_path.read_text()) if ledger_path.exists() else []
    accepted = [r['manifest'] for r in log if r['status'] == 'acquired']
    hashes = {r['sha256'] for r in log if r['status'] == 'acquired'}
    acquired_urls = {r['source_url'] for r in log if r['status'] == 'acquired'}
    already = {r['source_url'] for r in log if r['source_url'] in acquired_urls or
               not (r['provider'] == 'nasa' and r.get('error_type') == 'ValueError' and not r.get('technical_reason'))}
    detail_path = folder / 'source-api-calls.json'
    detail_calls = json.loads(detail_path.read_text()) if detail_path.exists() else dict(calls=0)
    source_client = SearchClient(ua, max_calls=max_api_calls*result_page, delay=0)
    source_client.calls = search_calls + detail_calls['calls']

    def debit_detail():
        detail_calls['calls'] = source_client.calls - search_calls
        write_private(detail_path, detail_calls)

    source_client.on_call = debit_detail

    def original_source(meta):
        if meta['provider'] != 'nasa':
            return meta
        url = 'https://images-api.nasa.gov/asset/' + quote(meta['source_id'], safe='')
        cache = folder / 'source-assets' / (digest(url.encode()) + '.json')
        if cache.exists():
            data = json.loads(cache.read_text())
        else:
            data = source_client.get(url)
            write_private(cache, data)
        files = []
        for row in data.get('collection', {}).get('items', []):
            href = row.get('href', '')
            if not re.search(r'\.(jpe?g|png|webp)$', href, re.I):
                continue
            parsed = urlsplit(href)
            # NASA's official listing still returns HTTP asset links. Upgrade
            # only the known official image host; download validates it again.
            if parsed.scheme == 'http' and parsed.hostname == 'images-assets.nasa.gov':
                href = urlunsplit(parsed._replace(scheme='https'))
            files.append(href)
        require(bool(files), 'NASA: nessun originale raster disponibile')
        files.sort(key=lambda value: (0 if '~orig.' in value else 1 if '~large.' in value else 2, value))
        return {**meta, 'image_url': files[0], 'asset_lookup_url': url, 'asset_files': files}

    def acquire(meta):
        license_info = recognized_license(meta.get('rights'))
        require(not license_info or 'ND' not in license_info['name'], 'Licenza senza derivati: ritaglio escluso')
        client = Client(ua, delay=0)
        raw, sha, phash = download(meta, client, allowed)
        with Image.open(io.BytesIO(raw)) as image:
            require(image.format in ('JPEG', 'PNG', 'WEBP'), 'Formato non fotografico supportato')
            require(image.width * image.height <= 30_000_000, 'Originale oltre il limite di 30 megapixel')
            ext = dict(JPEG='jpg', PNG='png', WEBP='webp')[image.format]
            size = list(image.size)
        return raw, sha, phash, ext, size, license_info

    # Small bounded waves download independently; there is no OpenAI Batch job.
    pending = [r for r in ordered if r['source_url'] not in already and https(r['source_url'])]
    with ThreadPoolExecutor(max_workers=4) as pool:
        while pending and len(accepted) < target:
            wave, pending = pending[:min(4, target-len(accepted))], pending[min(4, target-len(accepted)):]
            futures = []
            for meta in wave:
                try:
                    resolved = original_source(meta)
                    futures.append((resolved, pool.submit(acquire, resolved)))
                except (ValueError, OSError, KeyError, TypeError) as error:
                    log.append(dict(source_url=meta['source_url'], provider=meta['provider'], source_id=meta['source_id'],
                                    status='excluded', error_type=type(error).__name__, http_status=getattr(error, 'code', None)))
                    write_private(ledger_path, log)
            for meta, future in futures:
                item = dict(source_url=meta['source_url'], provider=meta['provider'], source_id=meta['source_id'])
                try:
                    raw, sha, phash, ext, size, license_info = future.result()
                    require(sha not in hashes, 'Duplicato esatto')
                    uid = 'real-' + f'{len(accepted)+1:03}'
                    relative = 'real-originals/' + uid + '.' + ext
                    path = folder / relative
                    path.write_bytes(raw)
                    path.chmod(0o600)
                    author = html.unescape(re.sub(r'<[^>]*>', '', meta.get('author') or '')).strip()[:500]
                    proof = dict(kind='REAL', content_kind='unknown', license_url=license_info['url'] if license_info else None,
                        author=author or 'Autore da verificare presso la fonte ' + meta['provider'], provider=meta['provider'],
                        source_id=meta['source_id'], source_url=meta['source_url'], authenticity='unverified', semantic_edit=False,
                        transformations=['exif_orientation', 'resize', 'compression', 'format_conversion'],
                        evidence=[dict(id='source', url=meta['source_url'], statement='Scheda restituita dalla fonte ufficiale: ' + str(meta.get('title', ''))[:350] + '. Natura fotografica, autore e autenticità da verificare.'),
                                  dict(id='acquisition', url=meta['image_url'], statement='File acquisito dall’URL fornito dalla fonte; SHA-256 ' + sha + '. Originale e metadati conservati privatamente.')])
                    if license_info:
                        proof['evidence'].append(dict(id='license', url=license_info['url'], statement='Licenza indicata nei metadati della fonte; applicabilità e obblighi da verificare: ' + license_info['name']))
                    provenance(proof, 'REAL')
                    record = dict(id=uid, file=relative, provenance=proof)
                    accepted.append(record)
                    hashes.add(sha)
                    item.update(status='acquired', sha256=sha, phash=phash, dimensions=size, manifest=record)
                    write_private(folder / 'source-documents' / (uid + '.json'), meta)
                except (ValueError, OSError, KeyError, TypeError, Image.DecompressionBombError) as error:
                    item.update(status='excluded', error_type=type(error).__name__, http_status=getattr(error, 'code', None),
                                technical_reason=str(error)[:200] if isinstance(error, ValueError) else type(error).__name__)
                log.append(item)
                write_private(ledger_path, log)
                write_private(folder / 'real-manifest.json', accepted)
                print(json.dumps(dict(stage='source_acquisition', acquired=len(accepted), examined=len(log))), flush=True)
    require(len(accepted) == target, 'Fonti utilizzabili insufficienti; nessuna generazione sostitutiva')
    return dict(real_candidates=len(accepted), source_search=result, authenticity_verified=False)
