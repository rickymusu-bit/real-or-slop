"""Editorial metadata contracts against the isolated LOCAL Worker/D1."""
import concurrent.futures
import http.cookiejar
import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path

base = os.environ.get('ROS_TEST_BASE', 'http://127.0.0.1:8787')
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]

def request(path, method='GET', data=None, auth=token, origin=None):
    headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer '+auth}
    if origin: headers['Origin'] = origin
    req = urllib.request.Request(base+path, method=method, headers=headers,
                                 data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req) as response: return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error: return error.code, json.loads(error.read())

for kind in ['REAL', 'AI']:
    uid = str(uuid.uuid4())
    metadata = dict(type=kind, title='Editorial test', description='Fixture', author='Local tester',
                    source_url='https://example.invalid/curation/'+uid, source_id=uid, provider='manual',
                    license_name='CC0', license_url='https://creativecommons.org/publicdomain/zero/1.0/',
                    evidence='Documentary fixture only', explanation='Fixture reveal', categories=['arte'],
                    difficulty='facile', ai_model='fixture', ai_prompt='Synthetic fixture',
                    owner_declaration=True, generation_date='2026-10-25')
    status, imported = request('/api/admin/import', 'POST', metadata)
    assert status == 201, (status, imported)
    image = imported['id']
    path = '/api/admin/images/'+image+'/curation'
    assert request(path)[1] == {'curation': None, 'events': []}
    for method in ['GET', 'PUT', 'DELETE']:
        assert request(path, method, {}, auth='wrong')[0] == 401
        assert request(path, method, {}, auth='')[0] == 401
    assert request('/admin', auth='wrong')[0] == 401
    assert request(path, 'PUT', {}, origin='https://foreign.invalid')[0] == 403
    assert request(path, 'DELETE')[0] == 405
    assert request('/api/admin/images/nonexistent/curation')[0] == 404
    payload = dict(revision=0, reason='Classificazione umana iniziale', curation={
        'subject_kind': 'trasporti', 'country_or_region': 'europa', 'period_bucket': '1900_1945',
        'image_medium': 'foto_bn', 'composition': 'scena_ampia', 'familiarity': 'bassa',
        'perceived_plausibility': 'sorprendente', 'cognitive_mechanism': 'inferenza_temporale',
        'surprise_reason': 'PRIVATE_SURPRISE_FIXTURE', 'reviewer_notes': 'Esperto: profilo sperimentale',
        'represented_place': 'Scena rappresentata: non provata',
    })
    for invalid in [
        {**payload, 'revision': -1}, {**payload, 'revision': True},
        {**payload, 'revision': '0'}, {**payload, 'reason': ''},
        {**payload, 'curation': {'type': 'AI'}},
        {**payload, 'curation': {'familiarity': 'invalid'}},
        {**payload, 'curation': {'reviewer_notes': 'x'*4001}},
        {**payload, 'curation': {'verified_date': '1930'}},
        {**payload, 'curation': {'verified_place': 'Roma', 'fact_evidence': 'Archive fixture'}},
    ]:
        assert request(path, 'PUT', invalid)[0] == 400, invalid.keys()
    assert request(path)[1]['events'] == []
    status, saved = request(path, 'PUT', payload)
    assert status == 200, (status, saved)
    assert saved['curation']['revision'] == 1
    assert saved['curation']['verified_place'] is None
    status, listed = request('/api/admin/images?status=in-review')
    candidate = next(row for row in listed if row['id'] == image)
    assert candidate['type'] == kind and candidate['status'] == 'in-review'
    assert candidate['source_url'] == metadata['source_url']
    assert candidate['evidence'] == metadata['evidence']
    assert candidate['license_url'] == metadata['license_url']
    assert candidate['difficulty'] == 'facile'
    assert candidate['curation']['surprise_reason'] == 'PRIVATE_SURPRISE_FIXTURE'
    assert request('/api/admin/review/'+image, 'POST', dict(decision='approved', notes='No checks'))[0] == 400
    assert request(path, 'PUT', payload)[0] == 409
    history = request(path)[1]['events']
    assert len(history) == 1 and json.loads(history[0]['before_json']) is None
    assert json.loads(history[0]['after_json']) == saved['curation']
    assert token not in json.dumps(history) and len(history[0]['reviewer']) == 12

    verified = {**payload, 'revision': 1, 'facts_confirmed': True,
                'curation': {**payload['curation'], 'verified_date': '1930 circa',
                             'verified_place': 'Roma', 'fact_evidence': 'Scheda archivistica fixture: https://example.invalid/item'}}
    with concurrent.futures.ThreadPoolExecutor(2) as executor:
        outcomes = list(executor.map(lambda _: request(path, 'PUT', verified)[0], range(2)))
    assert sorted(outcomes) == [200, 409], outcomes
    current = request(path)[1]
    assert current['curation']['revision'] == 2 and len(current['events']) == 2
    assert json.loads(current['events'][0]['before_json']) == saved['curation']
    assert current['curation']['verified_date'] == '1930 circa'
    # PUT replaces the sheet: explicit empty/omitted fields clear classifications.
    assert request(path, 'PUT', dict(revision=2, reason='Rimuovi classificazioni provvisorie', curation={}))[0] == 200
    assert request(path)[1]['curation']['verified_date'] is None
    # First-ever competing saves also produce exactly one snapshot/event.
    metadata['source_id'] = str(uuid.uuid4()); metadata['source_url'] += '-race'
    _, imported = request('/api/admin/import', 'POST', metadata)
    race = '/api/admin/images/'+imported['id']+'/curation'
    with concurrent.futures.ThreadPoolExecutor(2) as executor:
        outcomes = list(executor.map(lambda _: request(race, 'PUT', payload)[0], range(2)))
    assert sorted(outcomes) == [200, 409], outcomes
    assert len(request(race)[1]['events']) == 1

# Existing approved demo images remain usable with absent metadata. A private
# annotation on one of them must not escape through ANY round of a full session.
_, approved = request('/api/admin/images?status=approved')
demo = next(row for row in approved if row['demo'])
path = '/api/admin/images/'+demo['id']+'/curation'
previous = request(path)[1]['curation']
status, _ = request(path, 'PUT', dict(revision=previous['revision'] if previous else 0,
                                    reason='Verifica isolamento metadati demo',
                                    curation={'surprise_reason': 'PRIVATE_SURPRISE_FIXTURE', 'familiarity': 'bassa'}))
assert status == 200
assert next(row for row in request('/api/admin/images?status=approved')[1] if row['id'] == demo['id'])['status'] == 'approved'
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def game(path, method='GET', data=None):
    req = urllib.request.Request(base+path, method=method, headers={'Content-Type': 'application/json'},
                                 data=json.dumps(data).encode() if data is not None else None)
    with client.open(req) as response: return json.loads(response.read())
created = game('/api/sessions', 'POST', dict(mode='training', count=24))
sid = created['id']
total = game('/api/sessions/'+sid)['total']
assert total == 12  # 12 distinct images per class guarantee every possible sequence.
for _ in range(total):
    state = game('/api/sessions/'+sid)
    assert state['total'] == total and not state['done'], state
    serialized = json.dumps(state)
    for secret in ['curation', 'PRIVATE_SURPRISE_FIXTURE', 'surprise_reason', 'familiarity', 'ai_prompt', 'evidence']:
        assert secret not in serialized, secret
    question = state['question']
    assert set(question) == {'id', 'number', 'image', 'alt'}
    game('/api/sessions/'+sid+'/ready', 'POST', dict(roundId=question['id']))
    revealed = game('/api/sessions/'+sid+'/answer', 'POST', dict(roundId=question['id'], choice='REAL'))
    assert 'PRIVATE_SURPRISE_FIXTURE' not in json.dumps(revealed)
assert game('/api/sessions/'+sid)['done']
print('Curation integration passed: REAL/AI, optional metadata, auth/origin, validation, facts, immutable snapshots, concurrent saves, approval gate, full demo session without spoilers.')
