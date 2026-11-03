"""Import an already generated, hash-verified private comparison. No model calls."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import zipfile
from urllib.request import Request, build_opener

from .editorial import Remote, PipelineStop, evaluation, slop_import_item, write_private
from .importer import NoRedirect, RequestError, prepare, request, upload

SITE = 'https://real-or-slop.rickymusu.workers.dev'
RUN = 'direct-20-2026-11-03-isolated'


def file_hash(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def extract_verified(bundle, expected, root):
    if not re.fullmatch('[a-f0-9]{64}', expected) or file_hash(bundle) != expected:
        raise PipelineStop('Archivio diverso dal checksum autorizzato')
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    root.chmod(0o700)
    with zipfile.ZipFile(bundle) as archive:
        entries = archive.infolist()
        if len(entries) > 1000 or sum(entry.file_size for entry in entries) > 250_000_000:
            raise PipelineStop('Archivio oltre i limiti')
        for entry in entries:
            target = (root / entry.filename).resolve()
            if not target.is_relative_to(root) or stat.S_ISLNK(entry.external_attr >> 16):
                raise PipelineStop('Percorso archivio non consentito')
        archive.extractall(root)
    media = json.loads((root / 'media-manifest.json').read_text())
    if len(media) != 60:
        raise PipelineStop('Manifest richiesto: 40 file sorgente e 20 file generati')
    files = {}
    for item in media:
        path = (root / item['file']).resolve()
        if not path.is_relative_to(root) or not path.is_file() or not 0 < path.stat().st_size <= 12_000_000:
            raise PipelineStop('File non consentito nel manifest')
        if file_hash(path) != item['sha256']:
            raise PipelineStop('Impronta del file diversa dal manifest')
        key = (item['id'], item['kind'])
        if key in files:
            raise PipelineStop('File duplicato nel manifest')
        files[key] = item
    ranked = json.loads((root / 'evaluation/ranking.json').read_text())
    if len(ranked) != 20 or len({photo['id'] for photo in ranked}) != 20:
        raise PipelineStop('Classifica congelata di 20 fotografie richiesta')
    for index, photo in enumerate(ranked):
        if photo['rank'] != index + 1 or photo['role'] != ('REAL' if index < 10 else 'SLOP'):
            raise PipelineStop('Assegnazione diversa dalla classifica unica')
        result = evaluation(photo['evaluation'])
        if result['score'] != photo['evaluation']['score'] or not result['photographic']:
            raise PipelineStop('Valutazione della fotografia non valida')
        if index and ranked[index - 1]['evaluation']['score'] < result['score']:
            raise PipelineStop('Classifica non ordinata')
        original, preview = files[(photo['id'], 'original')], files[(photo['id'], 'preview')]
        if original['sha256'] != photo['original_sha256'] or preview['sha256'] != photo['file_sha256']:
            raise PipelineStop('File della sorgente diverso dalla classifica')
        photo['file'] = original['file']
        photo['metadata']['derived_file'] = preview['file']
    attempts = [json.loads(p.read_text()) for p in sorted((root / 'evaluation/attempts').glob('*.json'))]
    if len(attempts) != 10 or len({row['reference_id'] for row in attempts}) != 10:
        raise PipelineStop('Dieci tentativi, uno per sorgente, richiesti')
    sources = {photo['id'] for photo in ranked if photo['role'] == 'SLOP'}
    for record in attempts:
        if record['reference_id'] not in sources or record['status'] not in ('accepted', 'discarded'):
            raise PipelineStop('Tentativo non appartenente al lotto')
        result = evaluation(record['evaluation'])
        accepted = result['score'] >= 65 and result['photographic'] and bool(result['concrete_motive'].strip())
        if result['score'] != record['evaluation']['score'] or accepted != (record['status'] == 'accepted') or record['editorial_threshold'] != 65:
            raise PipelineStop('Decisione diversa dalla valutazione originale')
        for kind, field, checksum in [('original', 'file', 'original_sha256'), ('preview', 'derived_file', 'sha256')]:
            item = files[(record['id'], kind)]
            if item['sha256'] != record[checksum]:
                raise PipelineStop('File generato diverso dal dossier')
            record[field] = item['file']
    return ranked, attempts, files


def verify_media(base, token, path, expected):
    req = Request(base + '/api/admin/editorial/' + path, headers={'Authorization': 'Bearer ' + token, 'User-Agent': 'RealOrSlop/0.14.1 (+' + base + '/)'})
    with build_opener(NoRedirect()).open(req, timeout=90) as response:
        raw = response.read(12_000_001)
        if hashlib.sha256(raw).hexdigest() != expected or response.headers.get('Cache-Control') != 'no-store' or response.headers.get('X-Content-Type-Options') != 'nosniff':
            raise PipelineStop('Archivio remoto diverso dal file o privo di protezioni cache')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--out', type=Path, default=Path('.pipeline/imported-direct-20'))
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args(argv)
    try:
        root = args.out.resolve()
        ranked, attempts, files = extract_verified(args.bundle, args.sha256, root)
        if not args.execute:
            print(json.dumps(dict(references=len(ranked), attempts=len(attempts), media=len(files), paid_calls=False, remote_writes=False)))
            return 0
        if os.getenv('OPENAI_API_KEY'):
            raise PipelineStop('Eseguire questo importer senza OPENAI_API_KEY')
        token = os.getenv('REAL_OR_SLOP_ADMIN_TOKEN', '')
        remote = Remote(SITE, token, RUN)
        capabilities = request(SITE, token, '/api/admin/import')
        if not all(capabilities.get(key) for key in ('attempt_media_archive', 'original_archive', 'quarantine_configured', 'images_configured')):
            raise PipelineStop('Backend o storage non pronti per l’archiviazione')
        before = remote.call('state')
        existing = {row['id']: row for row in before['references']}
        overlaps = [photo for photo in ranked if photo['id'] in existing]
        if overlaps and len(overlaps) != 20:
            raise PipelineStop('Registro parziale: verificare prima di riprendere')
        for photo in overlaps:
            if any(photo[key] != existing[photo['id']][key] for key in ('role', 'rank', 'original_sha256', 'file_sha256', 'perceptual_hash')):
                raise PipelineStop('Registro esistente diverso dal lotto congelato')
        if before['queue']['count'] + sum(row['status'] == 'accepted' for row in attempts) > 100:
            raise PipelineStop('Coda privata piena')
        remote.register(ranked, registered=bool(overlaps), root=root)
        receipt = dict(batch_id=RUN, references=20, generated_attempts=0, candidates=0, media_verified=0, paid_calls=False)
        for record in attempts:
            image_id = None
            if record['status'] == 'accepted':
                photo = next(photo for photo in ranked if photo['id'] == record['reference_id'])
                item = slop_import_item(photo, record)
                image_id = upload(SITE, token, prepare(item, root))['id']
                receipt['candidates'] += 1
            remote.save_attempt(record, image_id, root=root)
            receipt['generated_attempts'] += 1
            write_private(root / 'import-summary.json', receipt)
        for photo in ranked:
            for kind, checksum in [('original', 'original_sha256'), ('preview', 'file_sha256')]:
                verify_media(SITE, token, f'references/{photo["id"]}/{kind}', photo[checksum])
                receipt['media_verified'] += 1
        for record in attempts:
            for kind, checksum in [('original', 'original_sha256'), ('preview', 'sha256')]:
                verify_media(SITE, token, f'attempts/{record["id"]}/{kind}', record[checksum])
                receipt['media_verified'] += 1
        after = remote.call('state')
        if before['diagnostics'] != after['diagnostics']:
            raise PipelineStop('Diagnostica del catalogo cambiata: verificare concorrenza')
        dossier = remote.call('dossiers')
        imported = [row for row in dossier['attempts'] if row['id'] in {attempt['id'] for attempt in attempts}]
        if len(imported) != 10 or any(not row['media_available'] or row['published_at'] for row in imported):
            raise PipelineStop('Dossier incompleti o pubblicazione inattesa')
        receipt.update(catalog_unchanged=True, all_previews_available=True, queue_after=after['queue']['count'])
        write_private(root / 'import-summary.json', receipt)
        print(json.dumps(receipt))
        return 0
    except Exception as error:
        print(str(error) if isinstance(error, (PipelineStop, RequestError)) else 'Importazione interrotta; conservare bundle e ricevuta per il recupero idempotente')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
