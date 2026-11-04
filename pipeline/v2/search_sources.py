"""Configured official search APIs. Credentials never enter logs or manifests."""
import hashlib
import json
import os
import re
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener

from ..editorial import PipelineStop
from ..importer import NoRedirect
from ..providers import Client, PROVIDERS, candidate
from .protocol import require

DEFAULT_ENGINES = ('openverse', 'commons', 'loc', 'nasa', 'met', 'smithsonian')
API_HOSTS = {'api.openverse.org', 'commons.wikimedia.org', 'www.loc.gov',
             'images-api.nasa.gov', 'collectionapi.metmuseum.org', 'api.si.edu', 'api.search.brave.com'}


class ConfigurationMissing(PipelineStop):
    pass


class CallLimit(PipelineStop):
    pass


class SearchClient(Client):
    def __init__(self, user_agent, max_calls=120, env=None, opener=None, delay=1, sleep=time.sleep):
        super().__init__(user_agent, delay=delay, sleep=sleep)
        require(type(max_calls) is int and 1 <= max_calls <= 2000, 'Limite API non valido')
        self.max_calls = max_calls
        self.env = os.environ if env is None else env
        self.opener = opener or build_opener(NoRedirect()).open
        self.token = self.env.get('OPENVERSE_ACCESS_TOKEN')
        self.token_until = float('inf') if self.token else 0

    def request(self, url, data=None, headers=None):
        parsed = urlsplit(url)
        require(parsed.scheme == 'https' and parsed.hostname in API_HOSTS and not parsed.username and not parsed.password,
                'Endpoint di ricerca non ammesso')
        if self.calls >= self.max_calls:
            raise CallLimit('Limite API raggiunto')
        self.calls += 1
        if getattr(self, 'on_call', None):
            self.on_call()
        self.sleep(self.delay)
        request = Request(url, data=data, headers={'User-Agent': self.ua, 'Accept': 'application/json', **(headers or {})})
        with self.opener(request, timeout=20) as response:
            raw = response.read(8_000_001)
            require(len(raw) <= 8_000_000, 'Risposta API troppo grande')
            value = json.loads(raw)
            require(isinstance(value, dict), 'Risposta API non valida')
            return value

    def openverse_headers(self):
        if self.token and time.monotonic() < self.token_until:
            return {'Authorization': 'Bearer ' + self.token}
        client_id, secret = self.env.get('OPENVERSE_CLIENT_ID'), self.env.get('OPENVERSE_CLIENT_SECRET')
        if not client_id and not secret:
            if self.token:
                raise ConfigurationMissing('Token Openverse scaduto')
            return {}
        if not client_id or not secret:
            raise ConfigurationMissing('Credenziali Openverse incomplete')
        result = self.request('https://api.openverse.org/v1/auth_tokens/token/',
                              urlencode(dict(grant_type='client_credentials', client_id=client_id, client_secret=secret)).encode(),
                              {'Content-Type': 'application/x-www-form-urlencoded'})
        require(isinstance(result.get('access_token'), str) and bool(result['access_token']) and
                type(result.get('expires_in')) is int and result['expires_in'] > 30, 'Token Openverse non valido')
        self.token = result['access_token']
        self.token_until = time.monotonic() + result['expires_in'] - 30
        return {'Authorization': 'Bearer ' + self.token}

    def get(self, url):
        host = urlsplit(url).hostname
        headers = self.openverse_headers() if host == 'api.openverse.org' else {}
        if host == 'api.search.brave.com':
            key = self.env.get('BRAVE_IMAGE_SEARCH_KEY')
            if not key:
                raise ConfigurationMissing('BRAVE_IMAGE_SEARCH_KEY mancante')
            headers['X-Subscription-Token'] = key
        return self.request(url, headers=headers)


class OpenverseSearch:
    name = 'openverse'

    def __init__(self, sources=()):
        require(all(isinstance(x, str) and re.fullmatch(r'[a-z0-9_-]{1,80}', x) for x in sources), 'Fonti Openverse non valide')
        self.sources = tuple(sources)

    def search(self, client, query, limit):
        params = dict(q=query, page_size=min(limit, 20))
        if self.sources:
            params['source'] = ','.join(self.sources)
        data = client.get('https://api.openverse.org/v1/images/?' + urlencode(params))
        for row in data.get('results', []):
            record = candidate('openverse', row['id'], row.get('title'), row.get('foreign_landing_url'), row.get('url'),
                               row.get('creator'), row.get('license_url'), json.dumps(row), row.get('created_on'))
            record.update(upstream_source=row.get('source'), upstream_provider=row.get('provider'))
            yield record


class BraveImageSearch:
    name = 'brave'
    discovery_only = True
    paid = True

    def search(self, client, query, limit):
        data = client.get('https://api.search.brave.com/res/v1/images/search?' + urlencode(dict(q=query, count=limit)))
        for row in data.get('results', [])[:limit]:
            page, image = row.get('url'), (row.get('properties') or {}).get('url')
            if not page or not image:
                continue
            yield dict(source_url=page, image_url=image, title=row.get('title', ''),
                       id=hashlib.sha256((page + '\0' + image).encode()).hexdigest()[:32],
                       status='source_verification_pending')


def registry(openverse_sources=()):
    return {**PROVIDERS, 'openverse': OpenverseSearch(openverse_sources), 'brave': BraveImageSearch()}
