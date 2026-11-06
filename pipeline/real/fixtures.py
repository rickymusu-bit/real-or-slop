"""Synthetic transports only. They do not demonstrate retrieval effectiveness."""
import io
import hashlib
import json
from urllib.parse import parse_qs, urlsplit

from ..v2.fixtures import picture
from ..v2.search_sources import SearchClient


class FixtureAPI:
    def __init__(self):
        self.calls = []

    def request(self, endpoint, body):
        self.calls.append(body)
        stage = body['text']['format']['name']
        if stage == 'real_strategies':
            request = json.loads(body['input'][0]['content'][0]['text'].split('\n')[-1])
            value = dict(strategies=[dict(id='strategy-'+str(i), query='wild animals rescued during natural disasters '+str(i),
                                         rationale='A visible rescue situation, not a guaranteed emotion.') for i in range(request['count'])])
        elif stage == 'real_adaptation':
            request = json.loads(body['input'][0]['content'][0]['text'].split('\n')[-1])
            commons = request['provider_profile']['provider'] == 'commons'
            value = dict(variants=[dict(mode='text', query='animal rescue flood' if commons else 'wildlife rescue', category=None, language='en')])
        else:
            value = dict(photographic=True, usable=True, emotions=['compassion', 'curiosity'], topics=['animals'],
                         intensity='medium', valence=None, attention=60, readability=70, plausibility=80,
                         game_potential=50, observations=['A synthetic fixture, not evidence of actual people or events.'],
                         uncertainties=['Fixture only; no observed human reaction.'])
        return dict(status='completed', output=[dict(content=[dict(type='output_text', text=json.dumps(value))])]), 'fixture-request'


def search_client(max_calls=30):
    def opener(request, timeout):
        if 'commons.wikimedia.org' in request.full_url:
            pages = {}
            for i in range(4):
                pages[str(i)] = dict(pageid=i, title='Fixture '+str(i), imageinfo=[dict(mime='image/jpeg',
                    url=f'https://fixture.invalid/{i}.jpg', descriptionurl=f'https://fixture.invalid/page/{i}',
                    extmetadata={'Artist': {'value': 'Fixture author'}, 'LicenseUrl': {'value': 'https://creativecommons.org/publicdomain/zero/1.0/'}})])
            value = dict(query=dict(pages=pages))
        else:
            value = dict(results=[dict(id=str(i), title='Fixture '+str(i), url=f'https://fixture.invalid/{i+4}.jpg',
                foreign_landing_url=f'https://fixture.invalid/page/{i+4}', creator='Fixture author',
                license_url='https://creativecommons.org/publicdomain/zero/1.0/') for i in range(4)], next=None)
        return io.BytesIO(json.dumps(value).encode())
    return SearchClient('RealOrSlop/fixture (https://github.com/rickymusu-bit/real-or-slop)',
                        opener=opener, env={}, sleep=lambda _: None, max_calls=max_calls)


def documentary_manifest(store, hits):
    rows = []
    for i, hit in enumerate(hits):
        path = store.folder/f'fixture-{i}.png'
        raw = picture(i, (128, 96))
        path.write_bytes(raw); path.chmod(0o600)
        proof = dict(kind='REAL', content_kind='photograph', provider=hit['provider'], source_id=hit['source_id'],
                     source_url=hit['source_url'], authenticity='verified', semantic_edit=False,
                     license_url=hit['rights'], author='Synthetic fixture author',
                     evidence=[dict(id='fixture', url=hit['source_url'], statement='Synthetic fixture only; no actual provenance verification.')],
                     transformations=[])
        rows.append(dict(id='candidate-'+str(i), file=path.name, sha256=hashlib.sha256(raw).hexdigest(), provenance=proof,
                         attestation=dict(reviewer='Synthetic fixture', source_verified=True, rights_verified=True,
                                          verified_at='2026-11-06T14:00:00Z', original_source_url=hit['source_url']), features=None))
    return rows
