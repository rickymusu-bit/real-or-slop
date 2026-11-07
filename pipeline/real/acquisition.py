"""Explicit bounded source acquisition; template remains unverified and private."""
import hashlib
from ..editorial import now, write_private
from ..providers import Client
from ..run import download
from ..licenses import recognized_license
from ..v2.protocol import require
from .contracts import digest


def acquire(store, hosts, user_agent, maximum=20, revision=1, downloader=download, include_unlicensed=False):
    store.frozen()
    require(isinstance(hosts, list) and hosts and all(isinstance(h, str) and h and '/' not in h and ':' not in h for h in hosts), 'Host download espliciti richiesti')
    require(type(maximum) is int and 1 <= maximum <= 20 and type(revision) is int and revision > 0, 'Limiti acquisizione non validi')
    policy = dict(hosts=hosts, maximum=maximum)
    if include_unlicensed:
        policy['include_unlicensed'] = True
    store.save(f'acquisition-policy.r{revision}.v1.0.0.json', policy, immutable=True)
    hits = {}
    for path in (store.folder/'retrieval').glob('*.json'):
        for row in store.read(str(path.relative_to(store.folder)))['candidates']:
            hits[(row['provider'], row['source_id'])] = row
    client = Client(user_agent)
    records, logs = [], []
    for row in list(hits.values())[:maximum]:
        identity = dict(source=row, hosts=hosts, revision=revision)
        if include_unlicensed:
            identity['include_unlicensed'] = True
        key = digest(identity)
        receipt = 'acquisition/'+key+'.json'
        saved = store.read(receipt)
        if saved is None:
            saved = dict(status='started', source=row, created_at=now(), record=None)
            store.save(receipt, saved)
            license_info = recognized_license(row['rights'])
            if license_info is None and not include_unlicensed:
                saved.update(status='license_unresolved')
            else:
                try:
                    raw, sha, _ = downloader(row, client, hosts)
                    require(0 < len(raw) <= 12_000_000 and hashlib.sha256(raw).hexdigest() == sha, 'Download con SHA/dimensione non validi')
                    folder = store.folder/'acquired'/key
                    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
                    file = folder/'original.bin'
                    file.write_bytes(raw); file.chmod(0o600)
                    saved.update(status='acquired', record=dict(id='real-'+key[:24],
                        file=str(file.relative_to(store.folder)), sha256=sha, features=None,
                        provenance=dict(kind='REAL', content_kind='photograph', provider=row['provider'], source_id=row['source_id'],
                            source_url=row['source_url'], license_url=license_info['url'] if license_info else None, author=row['author'],
                            authenticity='unverified', semantic_edit=False, transformations=[], evidence=[dict(id='source',
                            url=row['source_url'], statement='Provider metadata only; verify original source and rights before attesting.')]),
                        attestation=dict(reviewer='', source_verified=False, rights_verified=False, verified_at='',
                                         original_source_url=row['source_url'])))
                except (OSError, ValueError, KeyError, TypeError) as error:
                    saved.update(status='error', error_type=type(error).__name__)
            store.save(receipt, saved)
        elif saved['status'] == 'started':
            saved.update(status='uncertain')
            store.save(receipt, saved)
        if saved['record'] is not None:
            file = store.folder/saved['record']['file']
            require(file.is_file() and hashlib.sha256(file.read_bytes()).hexdigest() == saved['record']['sha256'], 'Originale acquisito mancante/modificato')
            records.append(saved['record'])
        logs.append(saved)
    store.save(f'documentary-template.r{revision}.v1.0.0.json', records, immutable=True)
    editable = store.folder/f'documentary-input.r{revision}.v1.0.0.json'
    if not editable.exists():
        write_private(editable, records)  # Draft for the human; never overwrite their edits.
    return dict(records=records, editable_manifest=str(editable), outcomes=[row['status'] for row in logs], verified=False, published=False)
