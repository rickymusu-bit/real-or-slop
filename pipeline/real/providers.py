"""Deterministic Commons/Openverse HTTP, durable call allowance and no scraping."""
import json
import time
from urllib.error import HTTPError
from urllib.parse import urlencode

from ..editorial import now
from ..providers import candidate
from ..v2.search_sources import SearchClient, CallLimit
from ..v2.protocol import require
from .contracts import ROOT, VERSION, digest, validate

PROFILES = json.loads((ROOT/'shared/real-discovery-providers.v1.0.0.json').read_text())
for _profile in PROFILES.values():
    validate('provider_profile', _profile)


def variants(value, provider):
    validate('adaptation', value)
    require(provider in PROFILES, 'Provider non ammesso')
    require(all(row['mode'] in PROFILES[provider]['modes'] for row in value['variants']), 'Modalità non supportata')
    return value


def search(client, provider, variant, page_size, max_pages, audit):
    """Yield normalized records progressively, retaining partial results on errors."""
    profile = PROFILES[provider]
    mode, category = variant['mode'], variant['category']
    if mode == 'category':
        result = client.get(profile['endpoint']+'?'+urlencode(dict(action='query', format='json', titles=category)))
        require('error' not in result, 'Errore di risoluzione categoria Commons')
        pages = result.get('query', {}).get('pages', {})
        exists = any('missing' not in row and row.get('ns') == 14 and row.get('title') == category for row in pages.values())
        audit['category_resolution'] = 'verified' if exists else 'missing_text_fallback'
        if not exists:
            mode = 'text'
    continuation = None
    for page in range(max_pages):
        if provider == 'commons':
            params = dict(action='query', format='json', prop='imageinfo', iiprop='url|extmetadata|mime')
            if mode == 'category':
                params.update(generator='categorymembers', gcmtitle=category, gcmtype='file', gcmlimit=page_size)
                if continuation:
                    params['gcmcontinue'] = continuation
            else:
                params.update(generator='search', gsrsearch=variant['query'], gsrnamespace=6,
                              gsrlimit=page_size, gsroffset=page*page_size)
            data = client.get(profile['endpoint']+'?'+urlencode(params))
            require('error' not in data, 'Errore API Commons')
            rows = data.get('query', {}).get('pages', {})
            require(isinstance(rows, dict) and len(rows) <= page_size, 'Risultati Commons non validi')
            for row in rows.values():
                info = (row.get('imageinfo') or [{}])[0]
                meta = info.get('extmetadata', {})
                val = lambda key: meta.get(key, {}).get('value', '')
                if info.get('mime') not in ('image/jpeg', 'image/png', 'image/webp'):
                    audit['unsupported_media'] = audit.get('unsupported_media', 0)+1
                    continue
                yield candidate('commons', row['pageid'], row['title'], info.get('descriptionurl'), info.get('url'),
                                val('Artist'), val('LicenseUrl'), json.dumps(meta), val('DateTimeOriginal'))
            continuation = data.get('continue', {}).get('gcmcontinue')
            if not data.get('continue'):
                break
            if mode == 'category':
                require(isinstance(continuation, str) and len(continuation) <= 500, 'Continuazione categoria non valida')
        else:
            params = dict(q=variant['query'], page_size=page_size, page=page+1, **profile['filters'])
            data = client.get(profile['endpoint']+'?'+urlencode(params))
            require('detail' not in data and 'results' in data, 'Errore API Openverse')
            require(isinstance(data['results'], list) and len(data['results']) <= page_size, 'Risultati Openverse non validi')
            for row in data['results']:
                yield candidate('openverse', row['id'], row.get('title'), row.get('foreign_landing_url'), row.get('url'),
                                row.get('creator'), row.get('license_url'), json.dumps(row), row.get('created_on'))
            if not data.get('next'):
                break  # Never follow a provider-supplied URL.


def retrieve(store, provider, adapted, user_agent, client=None, max_calls=30, page_size=20, max_pages=1, revision=1):
    variants(adapted, provider)
    frozen = store.frozen()
    require(type(max_calls) is int and 1 <= max_calls <= 2000 and type(page_size) is int and 1 <= page_size <= 20
            and type(max_pages) is int and 1 <= max_pages <= 3 and type(revision) is int and revision > 0, 'Limiti retrieval non validi')
    identity = dict(freeze=digest(frozen), provider=provider, adapted=adapted, profile_sha256=digest(PROFILES[provider]),
                    max_calls=max_calls, page_size=page_size, max_pages=max_pages, revision=revision)
    key = digest(identity)
    path = 'retrieval/'+key+'.json'
    saved = store.read(path)
    if saved:
        if saved['status'] == 'started':
            saved.update(status='uncertain', reason='interrupted_no_implicit_retry')
            saved['outcome'] = outcome(provider, adapted, saved)
            store.save(path, saved)
        return saved
    network = store.read('network.v1.0.0.json') or dict(max_calls=max_calls, calls=0)
    require(network['max_calls'] == max_calls, 'Budget chiamate diverso dal checkpoint')
    client = client or SearchClient(user_agent, max_calls=max_calls)
    client.max_calls = max_calls
    client.calls = network['calls']
    started, before = time.monotonic(), client.calls
    def debit():
        network['calls'] = client.calls
        store.save('network.v1.0.0.json', network)
        saved['api_calls'] = client.calls-before
        store.save(path, saved)
    client.on_call = debit
    saved = dict(identity=identity, status='started', created_at=now(), candidates=[], variant_logs=[],
                 api_calls=0, elapsed_seconds=0, cost_usd=None)
    store.save(path, saved)
    for variant in adapted['variants']:
        rows, audit = [], {}
        log = dict(query=variant, status='started', http_status=None, reason=None)
        try:
            for row in search(client, provider, variant, page_size, max_pages, audit):
                rows.append(row)
                saved['candidates'].append(row)
                store.save(path, saved)  # Retain each result before the next page.
            log.update(status='completed' if rows else 'zero_hits', returned=len(rows))
        except (OSError, ValueError, KeyError, TypeError) as error:
            code = error.code if isinstance(error, HTTPError) else None
            log.update(status='partial' if rows else 'rate_limited' if code == 429 else 'error',
                       returned=len(rows) if rows else None, http_status=code,
                       reason='call_limit' if isinstance(error, CallLimit) else type(error).__name__)
            if code == 429:
                retry = error.headers.get('Retry-After', '') if error.headers else ''
                log['retry_after'] = retry[:80]
        log.update(audit)
        saved['variant_logs'].append(log)
        saved.update(api_calls=client.calls-before, elapsed_seconds=round(time.monotonic()-started, 4))
        store.save(path, saved)
        if log['status'] in ('partial', 'rate_limited', 'error'):
            break
    statuses = {row['status'] for row in saved['variant_logs']}
    saved.update(status='partial' if saved['candidates'] and statuses & {'partial', 'error', 'rate_limited'} else
                 'rate_limited' if 'rate_limited' in statuses else 'error' if 'error' in statuses else
                 'completed' if saved['candidates'] else 'zero_hits', completed_at=now())
    # Records retain source metadata as documentary hints, never verification.
    seen, unique = set(), []
    for row in saved['candidates']:
        identity = (row['provider'], row['source_id'])
        if identity not in seen:
            seen.add(identity); unique.append(row)
    saved['candidates'] = unique
    saved['outcome'] = outcome(provider, adapted, saved)
    return store.save(path, saved)


def outcome(provider, adapted, saved):
    last = saved['variant_logs'][-1] if saved['variant_logs'] else {}
    return validate('outcome', dict(version=VERSION, provider=provider, query=adapted, status=saved['status'],
        returned=len(saved['candidates']) if saved['candidates'] or saved['status'] in ('completed', 'zero_hits') else None,
        api_calls=saved['api_calls'], elapsed_seconds=saved['elapsed_seconds'],
        http_status=last.get('http_status'), reason=saved.get('reason') or last.get('reason'), cost_usd=None))
