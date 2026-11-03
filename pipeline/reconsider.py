"""Reconsider an archived lot under current policy. No OpenAI calls or new generation.

Default: read-only eligibility plan. --execute imports only archived bytes into
private review, preserving original scores, dossiers and existing human decisions.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, build_opener

from .editorial import Remote, PipelineStop, evaluation, slop_import_item, write_private
from .importer import NoRedirect, RequestError, prepare, upload
from .licenses import recognized_license

SITE = 'https://real-or-slop.rickymusu.workers.dev'


def eligible(result, threshold):
    return result['score'] >= threshold and result['photographic'] and bool(result['concrete_motive'].strip())


def archive_file(remote, root, path, relative, digest):
    target = (root / relative).resolve()
    if not target.is_relative_to(root): raise PipelineStop('Percorso archivio non consentito')
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == digest: return target
    req = Request(remote.base + '/api/admin/editorial/' + path, headers={'Authorization': 'Bearer ' + remote.token, 'User-Agent': 'RealOrSlop/0.14.3'})
    try:
        with build_opener(NoRedirect()).open(req, timeout=90) as response: raw = response.read(12_000_001)
    except OSError: raise PipelineStop('Archivio privato non disponibile') from None
    if not 0 < len(raw) <= 12_000_000 or hashlib.sha256(raw).hexdigest() != digest:
        raise PipelineStop('Archivio diverso dal checksum storico')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw); target.chmod(0o600)
    return target


def reconsider(remote, batch_id, root, execute=False):
    root = root.resolve()
    state = remote.call('state')
    dossiers = remote.call('dossiers')
    controls = remote.call('controls')
    threshold = float(controls['editorial_threshold'])
    if threshold != float(state['editorial_threshold']): raise PipelineStop('Policy cambiata durante il piano: riprovare prima di importare')
    if not 0 <= threshold <= 100: raise PipelineStop('Soglia server non valida')
    photos = sorted((row for row in state['references'] if row['batch_id'] == batch_id), key=lambda row: row['rank'])
    if not photos: raise PipelineStop('Lotto non trovato')
    attempts = [row for row in dossiers['attempts'] if row['reference_id'] in {photo['id'] for photo in photos}]
    inventory = {(row.get('provider'), row.get('source_id')): row for row in state['inventory']}
    tasks = []
    for photo in photos:
        assessment = evaluation(json.loads(photo['evaluation_json']))
        if photo['role'] == 'REAL' and eligible(assessment, threshold):
            tasks.append(('REAL', photo, None))
    for row in attempts:
        record = json.loads(row['dossier_json'])
        if record['status'] in ('accepted', 'discarded') and eligible(evaluation(record['evaluation']), threshold):
            photo = next(photo for photo in photos if photo['id'] == row['reference_id'])
            if photo['role'] != 'SLOP': raise PipelineStop('Generazione senza sorgente SLOP')
            tasks.append(('AI', photo, {**record, 'id': row['id'], 'reference_id': row['reference_id']}))
    summary = dict(batch_id=batch_id, editorial_threshold=threshold, real_eligible=sum(kind == 'REAL' for kind, _, _ in tasks), slop_eligible=sum(kind == 'AI' for kind, _, _ in tasks), ready_for_review=0, human_decisions_preserved=0, paid_calls=False, new_generations=0, remote_writes=execute)
    if not execute: return summary
    if any(kind == 'AI' for kind, _, _ in tasks) and (not recognized_license(os.getenv('GENERATED_LICENSE_URL')) or not os.getenv('GENERATED_LICENSE_NAME')):
        raise PipelineStop('Configurare la licenza dichiarata delle generazioni prima del riesame')
    if state['queue']['count'] + sum((json.loads(photo['metadata_json'])['provider'], json.loads(photo['metadata_json'])['source_id']) not in inventory if kind == 'REAL' else ('openai-editorial', record['id']) not in inventory for kind, photo, record in tasks) > int(controls['queue_limit']):
        raise PipelineStop('Coda privata piena')
    root.mkdir(parents=True, exist_ok=True); root.chmod(0o700)
    for kind, photo, record in tasks:
        metadata = json.loads(photo['metadata_json'])
        key = (metadata['provider'], metadata['source_id']) if kind == 'REAL' else ('openai-editorial', record['id'])
        existing = inventory.get(key)
        if existing and existing['status'] in ('approved', 'rejected'):
            summary['human_decisions_preserved'] += 1
            continue
        uid = quote(photo['id'] if kind == 'REAL' else record['id'], safe='')
        prefix = 'references' if kind == 'REAL' else 'attempts'
        original_sha = photo['original_sha256'] if kind == 'REAL' else record['original_sha256']
        preview_sha = photo['file_sha256'] if kind == 'REAL' else record['sha256']
        original = archive_file(remote, root, f'{prefix}/{uid}/original', f'{prefix}/{uid}/original.image', original_sha)
        preview = archive_file(remote, root, f'{prefix}/{uid}/preview', f'{prefix}/{uid}/preview.webp', preview_sha)
        if kind == 'REAL':
            metadata['derived_file'] = str(preview)
            item = dict(metadata=metadata, file=str(original), sha256=original_sha)
        else:
            item = slop_import_item({'metadata': metadata}, {**record, 'file': str(original), 'derived_file': str(preview)})
        imported = upload(remote.base, remote.token, prepare(item, root))
        if imported['status'] != 'in-review':
            summary['human_decisions_preserved'] += 1
            continue
        if kind == 'REAL': remote.call('reviews', dict(image_id=imported['id'], reference_id=photo['id']))
        result = remote.call('prepare', dict(image_id=imported['id']))
        if not result['ready']: raise PipelineStop('Riesame non pronto: verificare provenienza, file e policy corrente')
        summary['ready_for_review'] += 1
        write_private(root / 'summary.json', summary)
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch-id', required=True)
    parser.add_argument('--base', default=SITE)
    parser.add_argument('--out', type=Path, default=Path('.pipeline/reconsider'))
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args(argv)
    try:
        remote = Remote(args.base, os.getenv('REAL_OR_SLOP_ADMIN_TOKEN', ''), 'reconsider-' + args.batch_id)
        print(json.dumps(reconsider(remote, args.batch_id, args.out, args.execute)))
        return 0
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error) if isinstance(error, (PipelineStop, RequestError)) else 'Riesame interrotto; conservare il workspace e verificare configurazione e file')
        return 1


if __name__ == '__main__': raise SystemExit(main())
