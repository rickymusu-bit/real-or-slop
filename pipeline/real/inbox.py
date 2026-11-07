"""Export REAL candidates to the existing private site inbox before owner review."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.request import Request, build_opener

from ..editorial import now, write_private
from ..importer import NoRedirect
from ..v2.protocol import require
from .contracts import ROOT, VERSION, digest
from .review import document_path, profile_path, verify_media

REVIEW_URL = 'https://real-or-slop.rickymusu.workers.dev/admin'
SCRIPT = ROOT/'scripts/sync-review-inbox.py'
spec = importlib.util.spec_from_file_location('real_inbox_sync', SCRIPT)
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def acquired_candidates(store):
    """Technical copies for personal review, without inventing documentary attestations."""
    from ..v2.engine import media
    records = []
    for source in store.read('documentary-template.r1.v1.0.0.json') or []:
        path = 'acquired-review/'+source['id']+'.json'
        prior = store.read(path)
        if prior is None:
            raw = (store.folder/source['file']).read_bytes()
            require(hashlib.sha256(raw).hexdigest() == source['sha256'], 'Originale acquisito modificato')
            try:
                row = dict(id=source['id'], provenance=source['provenance'], attestation=source['attestation'],
                    blockers=['origin_unverified','license_unresolved'], features=None, review_state='pending',
                    **media(raw, store.folder, 'inputs', 'pending-'+source['id']))
                prior = dict(status='ready', candidate=row)
            except (OSError, ValueError, KeyError, TypeError) as error:
                prior = dict(status='technical_error', error_type=type(error).__name__)
            store.save(path, prior, immutable=True)
        if prior['status'] == 'ready':
            verify_media(store, prior['candidate'])
            records.append(prior['candidate'])
    return records


def export_pending(store, records=None, *, revision=1, document_revision=1):
    frozen = store.frozen()
    require(not frozen['simulated'], 'Fixture non esportabili nella coda reale')
    if records is None:
        records = store.read(profile_path(revision, document_revision)) or store.read(document_path(document_revision))
    require(isinstance(records, list) and 1 <= len(records) <= 200, 'Candidate con pixel necessari per la coda')
    titles = {}
    for path in (store.folder/'retrieval').glob('*.json'):
        for source in store.read('retrieval/'+path.name)['candidates']:
            titles[(source['provider'], source['source_id'])] = source['title']
    images = {}
    for row in records:
        verify_media(store, row)
        proof = row['provenance']
        require(proof['kind'] == 'REAL', 'Coda discovery riservata a REAL')
        if row['sha256'] in images:
            images[row['sha256']]['metadata']['source_candidates'].append(row['id'])
            continue
        # Inclusion never depends on a model score, documentary eligibility or
        # an earlier local vote. The existing uploader can only insert pending.
        images[row['sha256']] = dict(id='real-discovery-'+row['sha256'][:48], origin='REAL', sha256=row['sha256'],
            file=str(store.folder/row['derived_file']), original_file=str(store.folder/row['file']), pair_key=None,
            created_at=frozen['created_at'], metadata=dict(
                title=titles.get((proof['provider'], proof['source_id']), row['id']), author=proof['author'],
                source_url=proof['source_url'], license_url=proof['license_url'], source_kind='real-discovery',
                source_id=row['id'], source_candidates=[row['id']], intent=frozen['intent'], previous_decision='pending',
                perceptual_hash=row.get('perceptual_hash'),
                previous_assessment=row.get('visual'), provenance=dict(documentary=proof,
                    attestation=row['attestation'], blockers=row['blockers'], presentation=row['presentation'],
                    profile_image_sha256=row.get('profile_image_sha256'), human_rights_confirmed=False)))
    return export_images(store, list(images.values()))


def export_images(store, images):
    """Canonical pending-only manifest for either origin, including SLOP outputs."""
    require(not store.frozen()['simulated'], 'Fixture non esportabili nella coda reale')
    manifest = dict(version=VERSION, images=images)
    cycle = store.read('editorial-config.v1.0.0.json')
    if cycle is not None:
        for image in images:
            image['metadata'].update(cycle_id=store.read('cycle-config.v1.0.0.json')['run_id'],
                                     brief_sha256=digest(store.read('editorial-freeze.v1.0.0.json')))
    helpers.prepare(manifest, store.folder)  # Validate all files before export or remote effects.
    fingerprint = digest(manifest)
    path = store.folder/f'review-inbox.{fingerprint[:20]}.v1.0.0.json'
    if path.exists():
        require(json.loads(path.read_text()) == manifest, 'Manifest della coda modificato')
    else:
        write_private(path, manifest)
    return dict(manifest=str(path), manifest_sha256=fingerprint, images=len(images),
                review_url=REVIEW_URL, published=False)


class CloudflareInbox:
    """Use the same configured destination and credential as the canonical uploader."""
    def __init__(self):
        self.account, self.database, self.bucket = helpers.config()
        self.token = os.getenv('CLOUDFLARE_API_TOKEN', '')
        require(bool(self.token), 'CLOUDFLARE_API_TOKEN richiesto per sincronizzare la coda')
        self.base = 'https://api.cloudflare.com/client/v4/accounts/'+self.account
        self.opener = build_opener(NoRedirect()).open

    def query(self, sql, params):
        request = Request(self.base+'/d1/database/'+self.database+'/query',
            data=json.dumps(dict(sql=sql, params=params)).encode(), headers={
                'Authorization':'Bearer '+self.token, 'Content-Type':'application/json'})
        with self.opener(request, timeout=30) as response:
            value = json.load(response)
        require(value.get('success') and len(value['result']) == 1 and value['result'][0].get('success'),
                'Verifica della coda D1 non riuscita')
        return value['result'][0]['results']

    def pixels(self, key):
        request = Request(self.base+'/r2/buckets/'+self.bucket+'/objects/'+key,
                          headers={'Authorization':'Bearer '+self.token})
        with self.opener(request, timeout=30) as response:
            return response.read(12_000_001)


def receipt_path(export):
    return 'review-inbox-sync.'+export['manifest_sha256'][:20]+'.v1.0.0.json'


def synchronize(store, export=None, *, runner=subprocess.run, api_factory=CloudflareInbox):
    require(not store.frozen()['simulated'], 'Fixture non sincronizzabili nella coda reale')
    export = export or export_pending(store)
    manifest = json.loads(Path(export['manifest']).read_text())
    require(digest(manifest) == export['manifest_sha256'], 'Manifest della coda modificato')
    helpers.prepare(manifest, store.folder)
    api = api_factory()
    uploads = store.folder/('review-inbox-uploads.'+export['manifest_sha256'][:20]+'.v1.0.0.json')
    result = runner([sys.executable, str(SCRIPT), export['manifest'], '--apply', '--receipts', str(uploads)],
                    cwd=ROOT, capture_output=True, text=True)
    require(result.returncode == 0, 'Upload coda interrotto: ricevute private conservate, ripresa esplicita richiesta')
    rows, excluded, tombstones = [], set(), []
    expected = {(row['origin'], row['sha256']) for row in manifest['images']}
    for origin in ('REAL', 'AI'):
        shas = sorted(sha for kind, sha in expected if kind == origin)
        for offset in range(0, len(shas), 90):
            chunk = shas[offset:offset+90]
            placeholders = ','.join('?' for _ in chunk)
            rows.extend(api.query("SELECT id,origin,source_sha256,sha256,media_key,status,revision FROM editorial_review_effective_images WHERE origin='"+origin+"' AND source_sha256 IN ("+placeholders+')', chunk))
            deleted = api.query("SELECT image_id,sha256,revision FROM editorial_review_deleted_images WHERE origin='"+origin+"' AND sha256 IN ("+placeholders+')', chunk)
            excluded.update((origin, row['sha256']) for row in deleted)
            tombstones.extend(dict(row, origin=origin) for row in deleted)
    found = {(row['origin'], row['source_sha256']) for row in rows}
    require(found | excluded == expected, 'Importazione non confermata nella coda del sito')
    for row in rows:
        require(row['origin'] in ('REAL', 'AI') and row['status'] in ('pending', 'approved', 'rejected'), 'Riga della coda non valida')
        require(hashlib.sha256(api.pixels(row['media_key'])).hexdigest() == row['sha256'], 'Pixel della coda diversi dalla copia esaminata')
    report = dict(version=VERSION, checked_at=now(), manifest_sha256=export['manifest_sha256'],
        review_url=REVIEW_URL, images=rows, deleted_excluded=len(excluded), deleted_images=tombstones,
        pending=sum(row['status']=='pending' for row in rows), published=False,
        destination=dict(account=api.account, database=api.database, bucket=api.bucket))
    store.save(receipt_path(export), report)
    store.save('review-inbox-audit.'+digest(report)[:20]+'.v1.0.0.json', report, immutable=True)
    return report
